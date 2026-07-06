import { NextRequest, NextResponse } from 'next/server'
import {
  EtymologyResult,
  ApiResponse,
  StreamEvent,
  StageConfidence,
  ResearchContext,
} from '@/lib/types'
import { synthesizeFromResearch, streamSynthesis, SynthesisResult } from '@/lib/llm'
import { conductAgenticResearch } from '@/lib/research'
import { isLikelyTypo, getSuggestions } from '@/lib/spellcheck'
import { getRandomWord } from '@/lib/wordlist'
import { getQuirkyMessage } from '@/lib/prompts'
import { getCachedEtymology, cacheEtymology, getNegativeCache, cacheNegative } from '@/lib/cache'
import { isValidWord, canonicalizeWord } from '@/lib/validation'
import { getCostMode, recordSpend } from '@/lib/costGuard'
import {
  tryAcquireLock,
  releaseLock,
  startLockHeartbeat,
  isLockHeld,
  pollForResult,
} from '@/lib/singleflight'
import { incrCounter } from '@/lib/counters'
import { safeError } from '@/lib/errorUtils'
import { getEnv } from '@/lib/env'
import { CONFIG } from '@/lib/config'
import { emitSecurityEvent } from '@/lib/telemetry'
import { streamErrorResponse, streamResultResponse } from '@/lib/streamingResponse'
import { classifyApiError } from '@/lib/apiError'

// Uncached searches run a multi-phase research + synthesis pipeline that can
// take minutes; without this the function dies at the platform default.
export const maxDuration = 300

const REDIS_DOWN_MESSAGE =
  'New word lookups are temporarily unavailable — our cache service is unreachable. ' +
  'Please try again in a few minutes.'
const IN_PROGRESS_MESSAGE = 'Request in progress, please retry in a few seconds.'

const CACHED_RESPONSE_HEADERS = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
} as const

function countConfidence(result: EtymologyResult, level: StageConfidence): number {
  const allStages = [
    ...result.ancestryGraph.branches.flatMap((branch) => branch.stages),
    ...(result.ancestryGraph.postMerge ?? []),
  ]
  return allStages.filter((stage) => stage.confidence === level).length
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ResearchOutcome =
  | { kind: 'ok'; researchContext: ResearchContext }
  | { kind: 'no_sources'; typoSuggestions?: string[]; fallbackSuggestion?: string }

type PipelineOutcome =
  | { kind: 'result'; result: EtymologyResult }
  | { kind: 'no_sources'; typoSuggestions?: string[]; fallbackSuggestion?: string }

type WaiterOutcome = PipelineOutcome | { kind: 'negative_cached' } | { kind: 'timeout' }

export async function GET(request: NextRequest) {
  let shouldStream = false

  try {
    // Validate environment (lazy, cached after first call)
    try {
      getEnv()
    } catch {
      return shouldStream
        ? streamErrorResponse('Service configuration error')
        : NextResponse.json<ApiResponse<null>>(
            { success: false, error: 'Service configuration error' },
            { status: 503 }
          )
    }

    // Feature flags
    if (!CONFIG.features.publicSearchEnabled || CONFIG.features.forceCacheOnly) {
      return shouldStream
        ? streamErrorResponse('Service temporarily unavailable')
        : NextResponse.json<ApiResponse<null>>(
            { success: false, error: 'Service temporarily unavailable' },
            { status: 503 }
          )
    }

    const word = request.nextUrl.searchParams.get('word')
    shouldStream = request.nextUrl.searchParams.get('stream') === 'true'

    if (!word || typeof word !== 'string') {
      return shouldStream
        ? streamErrorResponse('Word is required')
        : NextResponse.json<ApiResponse<null>>(
            { success: false, error: 'Word is required' },
            { status: 400 }
          )
    }

    const normalizedWord = canonicalizeWord(word)

    if (!normalizedWord) {
      return shouldStream
        ? streamErrorResponse(getQuirkyMessage('empty'))
        : NextResponse.json<ApiResponse<null>>(
            { success: false, error: getQuirkyMessage('empty') },
            { status: 400 }
          )
    }

    if (!isValidWord(normalizedWord)) {
      return shouldStream
        ? streamErrorResponse(getQuirkyMessage('nonsense'), 'nonsense')
        : NextResponse.json<ApiResponse<null>>(
            { success: false, error: getQuirkyMessage('nonsense') },
            { status: 400 }
          )
    }

    const costMode = await getCostMode()

    // Honor stream=true even for cached results so EventSource never receives JSON.
    const cached = await getCachedEtymology(normalizedWord)
    if (cached) {
      console.log(`[Etymology API] Cache hit for "${normalizedWord}"`)
      emitSecurityEvent({
        type: 'cache_hit',
        timestamp: Date.now(),
        detail: { word: normalizedWord },
      })
      void incrCounter('cache_hit')
      return shouldStream
        ? streamResultResponse(cached, { 'X-Protection-Mode': costMode })
        : NextResponse.json<ApiResponse<EtymologyResult> & { cached: boolean }>(
            { success: true, data: cached, cached: true },
            {
              headers: {
                ...CACHED_RESPONSE_HEADERS,
                'X-Protection-Mode': costMode,
              },
            }
          )
    }

    // Negative cache — skip source fetches for known gibberish
    const isNegCached = await getNegativeCache(normalizedWord)
    if (isNegCached) {
      console.log(`[Etymology API] Negative cache hit for "${normalizedWord}"`)
      const suggestion = getRandomWord()
      return shouldStream
        ? streamErrorResponse(getQuirkyMessage('nonsense'), 'nonsense')
        : NextResponse.json<ApiResponse<{ suggestion: string }>>(
            {
              success: false,
              error: getQuirkyMessage('nonsense'),
              data: { suggestion },
            },
            { status: 404 }
          )
    }

    // Reject uncached requests when monthly budget is exhausted
    if (costMode === 'cache_only') {
      emitSecurityEvent({
        type: 'budget_check',
        timestamp: Date.now(),
        detail: { word: normalizedWord, mode: costMode, action: 'rejected' },
      })
      return shouldStream
        ? streamErrorResponse(
            'Monthly budget reached. Cached words still work — try again next month for new ones.',
            'budget',
            { 'X-Protection-Mode': costMode }
          )
        : NextResponse.json<ApiResponse<null>>(
            {
              success: false,
              error:
                'Monthly budget reached. Cached words still work — try again next month for new ones.',
            },
            { status: 503, headers: { 'X-Protection-Mode': costMode } }
          )
    }

    // Singleflight: prevent duplicate LLM calls for the same word
    const lockKey = `lock:etymology:${normalizedWord}`
    const acquisition = await tryAcquireLock(lockKey)

    // Fail closed: an uncached synthesis without Redis would run with no
    // budget enforcement, no dedup, and no caching — reject it instead.
    // Cached lookups can't exist without Redis, so only uncached paths hit this.
    if (acquisition.status === 'unavailable' || acquisition.status === 'error') {
      console.error(
        `[Etymology API] Redis ${acquisition.status} — failing closed for uncached search`
      )
      return shouldStream
        ? streamErrorResponse(REDIS_DOWN_MESSAGE, 'network')
        : NextResponse.json<ApiResponse<null>>(
            { success: false, error: REDIS_DOWN_MESSAGE },
            { status: 503, headers: { 'Retry-After': '60' } }
          )
    }

    const runResearch = async (
      onProgress?: (event: StreamEvent) => void
    ): Promise<ResearchOutcome> => {
      const researchContext = await conductAgenticResearch(normalizedWord, {}, onProgress)

      if (!researchContext.mainWord.etymonline && !researchContext.mainWord.wiktionary) {
        cacheNegative(normalizedWord, 'no_sources').catch((err) => {
          console.error('[Etymology API] Negative cache store failed:', safeError(err))
        })

        if (isLikelyTypo(normalizedWord)) {
          return {
            kind: 'no_sources',
            typoSuggestions: getSuggestions(normalizedWord).map((s) => s.word),
          }
        }

        return {
          kind: 'no_sources',
          fallbackSuggestion: getRandomWord(),
        }
      }

      console.log(
        `[Etymology API] Research complete. Fetched ${researchContext.totalSourcesFetched} sources, ` +
          `identified ${researchContext.identifiedRoots.length} roots`
      )
      return { kind: 'ok', researchContext }
    }

    /**
     * Full holder pipeline: heartbeat the lock while working, record spend
     * (awaited) for both the root-extraction and synthesis calls, and write
     * the result to cache BEFORE the lock is released in `finally` so
     * waiters polling the cache always find it.
     */
    const runHolderPipeline = async (
      lockToken: string,
      emit?: (event: StreamEvent) => void
    ): Promise<PipelineOutcome> => {
      const stopHeartbeat = startLockHeartbeat(lockKey, lockToken)
      try {
        const research = await runResearch(emit)
        if (research.kind === 'no_sources') {
          return research
        }
        const researchContext = research.researchContext

        if (researchContext.llmUsage) {
          await recordSpend(researchContext.llmUsage)
        }

        let synthesis: SynthesisResult
        if (emit) {
          emit({ type: 'synthesis_started' })
          synthesis = await streamSynthesis(researchContext, (token) => {
            emit({ type: 'synthesis_token', token })
          })
        } else {
          synthesis = await synthesizeFromResearch(researchContext)
        }

        await recordSpend(synthesis.usage)

        await cacheEtymology(normalizedWord, synthesis.result)
        emitSecurityEvent({
          type: 'cache_miss',
          timestamp: Date.now(),
          detail: { word: normalizedWord, sources: researchContext.totalSourcesFetched },
        })
        void incrCounter('cache_miss')

        return { kind: 'result', result: synthesis.result }
      } finally {
        stopHeartbeat()
        releaseLock(lockKey, lockToken).catch(() => {})
      }
    }

    /**
     * Streaming waiter: poll the cache while the holder works, emitting
     * keepalive events so the SSE connection stays warm. If the lock
     * vanishes without a cached result (holder crashed), attempt promotion
     * and run the pipeline ourselves.
     */
    const waitAsStreamingWaiter = async (
      emit: (event: StreamEvent) => void
    ): Promise<WaiterOutcome> => {
      console.log(`[Etymology API] Waiting for in-flight result for "${normalizedWord}" (stream)`)
      const startedAt = Date.now()
      const { waiterPollIntervalMs, streamWaiterMaxWaitMs } = CONFIG.singleflight

      while (Date.now() - startedAt < streamWaiterMaxWaitMs) {
        await sleep(waiterPollIntervalMs)

        const result = await getCachedEtymology(normalizedWord)
        if (result) {
          return { kind: 'result', result }
        }

        if (await getNegativeCache(normalizedWord)) {
          return { kind: 'negative_cached' }
        }

        if (!(await isLockHeld(lockKey))) {
          const promotion = await tryAcquireLock(lockKey)
          if (promotion.status === 'acquired') {
            console.log(`[Etymology API] Promoted waiter to holder for "${normalizedWord}"`)
            return runHolderPipeline(promotion.token, emit)
          }
          // Another waiter won the promotion race — keep polling.
        }

        emit({ type: 'singleflight_wait', waitedMs: Date.now() - startedAt })
      }

      return { kind: 'timeout' }
    }

    if (shouldStream) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          const emit = (event: StreamEvent) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          }

          try {
            let outcome: WaiterOutcome
            if (acquisition.status === 'acquired') {
              console.log(
                `[Etymology API] Starting agentic research (streaming) for "${normalizedWord}"`
              )
              outcome = await runHolderPipeline(acquisition.token, emit)
            } else {
              outcome = await waitAsStreamingWaiter(emit)
            }

            if (outcome.kind === 'result') {
              emit({
                type: 'enrichment_done',
                highConfidence: countConfidence(outcome.result, 'high'),
                mediumConfidence: countConfidence(outcome.result, 'medium'),
              })
              emit({ type: 'result', data: outcome.result })
            } else if (outcome.kind === 'no_sources') {
              if (outcome.typoSuggestions && outcome.typoSuggestions.length > 0) {
                emit({
                  type: 'error',
                  message: `Hmm, we couldn't find "${word}".`,
                  errorType: 'typo',
                  suggestions: outcome.typoSuggestions,
                })
              } else {
                emit({
                  type: 'error',
                  message: getQuirkyMessage('nonsense'),
                  errorType: 'nonsense',
                })
              }
            } else if (outcome.kind === 'negative_cached') {
              emit({
                type: 'error',
                message: getQuirkyMessage('nonsense'),
                errorType: 'nonsense',
              })
            } else {
              emit({
                type: 'error',
                message: IN_PROGRESS_MESSAGE,
                errorType: 'rate_limit',
              })
            }
          } catch (error) {
            console.error('[Etymology API] Streaming error:', safeError(error))
            void incrCounter('error')
            const classified = classifyApiError(error)
            emit({
              type: 'error',
              message: classified.message,
              errorType: classified.streamErrorType,
            })
          }
          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Protection-Mode': costMode,
        },
      })
    }

    // Non-streaming waiter: short poll, then ask the client to retry.
    if (acquisition.status === 'busy') {
      console.log(`[Etymology API] Waiting for in-flight result for "${normalizedWord}"`)
      const result = await pollForResult(() => getCachedEtymology(normalizedWord))
      if (result) {
        return NextResponse.json<ApiResponse<EtymologyResult> & { cached: boolean }>(
          { success: true, data: result, cached: true },
          { headers: CACHED_RESPONSE_HEADERS }
        )
      }
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: IN_PROGRESS_MESSAGE },
        { status: 429, headers: { 'Retry-After': '15' } }
      )
    }

    console.log(`[Etymology API] Starting agentic research for "${normalizedWord}"`)
    const outcome = await runHolderPipeline(acquisition.token)

    if (outcome.kind === 'no_sources') {
      if (outcome.typoSuggestions && outcome.typoSuggestions.length > 0) {
        return NextResponse.json<ApiResponse<{ suggestions: string[] }>>(
          {
            success: false,
            error: `Hmm, we couldn't find "${word}". Did you mean:`,
            data: { suggestions: outcome.typoSuggestions },
          },
          { status: 404 }
        )
      }
      return NextResponse.json<ApiResponse<{ suggestion: string }>>(
        {
          success: false,
          error: getQuirkyMessage('nonsense'),
          data: { suggestion: outcome.fallbackSuggestion ?? getRandomWord() },
        },
        { status: 404 }
      )
    }

    return NextResponse.json<ApiResponse<EtymologyResult> & { cached: boolean }>(
      { success: true, data: outcome.result, cached: false },
      {
        headers: {
          ...CACHED_RESPONSE_HEADERS,
          'X-Protection-Mode': costMode,
        },
      }
    )
  } catch (error) {
    console.error('Etymology API error:', safeError(error))
    void incrCounter('error')
    const classified = classifyApiError(error)

    return shouldStream
      ? streamErrorResponse(classified.message, classified.streamErrorType)
      : NextResponse.json<ApiResponse<null>>(
          { success: false, error: classified.message },
          { status: classified.status }
        )
  }
}
