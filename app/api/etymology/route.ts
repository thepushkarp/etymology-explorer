import { NextRequest } from 'next/server'
import { EtymologyResult, StreamEvent, StageConfidence, ResearchContext } from '@/lib/types'
import { synthesizeFromResearch, getLlmUsageFromError, SynthesisResult } from '@/lib/llm'
import { conductAgenticResearch, hasCredibleMainSource } from '@/lib/research'
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
  markLockFailure,
  attemptPromotion,
  pollForResult,
} from '@/lib/singleflight'
import { incrCounter, incrLanguageCounter } from '@/lib/counters'
import { safeError } from '@/lib/errorUtils'
import { getEnv } from '@/lib/env'
import { CONFIG } from '@/lib/config'
import { emitSecurityEvent } from '@/lib/telemetry'
import { createResponseAdapter } from '@/lib/responseAdapter'
import { classifyApiError } from '@/lib/apiError'
import { LANGUAGES, lexemeKey, parseLanguageCode } from '@/lib/languages'

// Uncached searches run a multi-phase research + synthesis pipeline that can
// take minutes; without this the function dies at the platform default.
export const maxDuration = 300

const REDIS_DOWN_MESSAGE =
  'New word lookups are temporarily unavailable — our cache service is unreachable. ' +
  'Please try again in a few minutes.'
const IN_PROGRESS_MESSAGE = 'Request in progress, please retry in a few seconds.'

function countConfidence(result: EtymologyResult, level: StageConfidence): number {
  let count = 0
  for (const branch of result.ancestryGraph.branches) {
    for (const stage of branch.stages) if (stage.confidence === level) count += 1
  }
  for (const stage of result.ancestryGraph.postMerge ?? []) {
    if (stage.confidence === level) count += 1
  }
  return count
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

type WaiterOutcome =
  | PipelineOutcome
  | { kind: 'negative_cached' }
  | { kind: 'holder_failed'; message: string }
  | { kind: 'timeout' }

export async function GET(request: NextRequest) {
  let shouldStream = false

  try {
    shouldStream = request.nextUrl.searchParams.get('stream') === 'true'
    const respond = createResponseAdapter(shouldStream)

    // Validate environment (lazy, cached after first call)
    try {
      getEnv()
    } catch {
      return respond.error('Service configuration error', { status: 503 })
    }

    // Feature flags
    if (!CONFIG.features.publicSearchEnabled || CONFIG.features.forceCacheOnly) {
      return respond.error('Service temporarily unavailable', { status: 503 })
    }

    const word = request.nextUrl.searchParams.get('word')
    const language = parseLanguageCode(request.nextUrl.searchParams.get('language'))

    if (!language) {
      return respond.error('Unsupported language', { status: 400 })
    }
    await incrLanguageCounter(language, 'request')

    if (!word || typeof word !== 'string') {
      return respond.error('Word is required', { status: 400 })
    }

    const normalizedWord = canonicalizeWord(word)

    if (!normalizedWord) {
      return respond.error(getQuirkyMessage('empty'), { status: 400 })
    }

    if (!isValidWord(normalizedWord)) {
      return respond.error(getQuirkyMessage('nonsense'), { status: 400, errorType: 'nonsense' })
    }

    const costMode = await getCostMode()

    // Honor stream=true even for cached results so EventSource never receives JSON.
    const cached = await getCachedEtymology(normalizedWord, language)
    if (cached) {
      console.log(`[Etymology API] Cache hit for "${normalizedWord}"`)
      emitSecurityEvent({
        type: 'cache_hit',
        timestamp: Date.now(),
        detail: { word: normalizedWord, language },
      })
      await incrCounter('cache_hit')
      await incrLanguageCounter(language, 'cache_hit')
      return respond.result(cached, {
        cached: true,
        headers: { 'X-Protection-Mode': costMode },
      })
    }

    // Negative cache — skip source fetches for known gibberish
    const isNegCached = await getNegativeCache(normalizedWord, language)
    if (isNegCached) {
      console.log(`[Etymology API] Negative cache hit for "${normalizedWord}"`)
      return respond.error(
        language === 'en'
          ? getQuirkyMessage('nonsense')
          : `No ${LANGUAGES[language].englishName} entry was found for “${normalizedWord}”.`,
        {
          status: 404,
          errorType: 'nonsense',
          ...(language === 'en' ? { unaryData: { suggestion: getRandomWord() } } : {}),
        }
      )
    }

    // Reject uncached requests when monthly budget is exhausted
    if (costMode === 'cache_only') {
      emitSecurityEvent({
        type: 'budget_check',
        timestamp: Date.now(),
        detail: { word: normalizedWord, mode: costMode, action: 'rejected' },
      })
      return respond.error(
        'Monthly budget reached. Cached words still work — try again next month for new ones.',
        { status: 503, errorType: 'budget', headers: { 'X-Protection-Mode': costMode } }
      )
    }

    // Singleflight: prevent duplicate LLM calls for the same word
    const lockKey = `lock:etymology:${lexemeKey(language, normalizedWord)}`
    const acquisition = await tryAcquireLock(lockKey)

    // Fail closed: an uncached synthesis without Redis would run with no
    // budget enforcement, no dedup, and no caching — reject it instead.
    // Cached lookups can't exist without Redis, so only uncached paths hit this.
    if (acquisition.status === 'unavailable' || acquisition.status === 'error') {
      console.error(
        `[Etymology API] Redis ${acquisition.status} — failing closed for uncached search`
      )
      return respond.error(REDIS_DOWN_MESSAGE, {
        status: 503,
        errorType: 'network',
        unaryHeaders: { 'Retry-After': '60' },
      })
    }

    const runResearch = async (
      onProgress?: (event: StreamEvent) => void
    ): Promise<ResearchOutcome> => {
      // request.signal aborts in-flight source fetches and LLM calls when the
      // client disconnects, so abandoned searches stop spending immediately.
      const researchContext = await conductAgenticResearch(
        normalizedWord,
        { signal: request.signal, language },
        onProgress
      )

      if (!hasCredibleMainSource(researchContext)) {
        // Awaited so the entry lands BEFORE the lock releases — waiters
        // poll the negative cache to learn this word has no sources.
        await cacheNegative(normalizedWord, 'no_sources', language)
        await incrLanguageCounter(language, 'no_source')

        if (language !== 'en') {
          return { kind: 'no_sources' }
        }

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
     * waiters polling the cache always find it. On error, a short-TTL
     * failure marker is written (also before release) so waiters surface
     * the failure instead of promoting and re-spending.
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
          synthesis = await synthesizeFromResearch(researchContext, {
            signal: request.signal,
            onSection: (section, data) => {
              emit({ type: 'synthesis_section', section, data })
            },
          })
        } else {
          synthesis = await synthesizeFromResearch(researchContext, { signal: request.signal })
        }

        await recordSpend(synthesis.usage)

        await cacheEtymology(normalizedWord, synthesis.result, language)
        emitSecurityEvent({
          type: 'cache_miss',
          timestamp: Date.now(),
          detail: { word: normalizedWord, language, sources: researchContext.totalSourcesFetched },
        })
        await incrCounter('cache_miss')

        return { kind: 'result', result: synthesis.result }
      } catch (error) {
        // A synthesis attempt that failed AFTER the model ran (malformed
        // output, schema validation) still billed us — count it toward
        // the budget before surfacing the failure. recordSpend never throws.
        const failedCallUsage = getLlmUsageFromError(error)
        if (failedCallUsage) {
          await recordSpend(failedCallUsage)
        }
        if (safeError(error).toLowerCase().includes('schema validation')) {
          await incrLanguageCounter(language, 'schema_failure')
        }

        // Distinguish "holder failed" from "holder crashed" for waiters:
        // written before the lock release below, checked before promotion.
        // A client disconnect is neither — skip the marker so a waiting
        // request can promote itself and finish the work.
        if (!request.signal.aborted) {
          await markLockFailure(lockKey, classifyApiError(error).message)
        }
        throw error
      } finally {
        stopHeartbeat()
        await releaseLock(lockKey, lockToken)
      }
    }

    /**
     * Streaming waiter: poll the cache while the holder works, emitting
     * keepalive events so the SSE connection stays warm. Promotion only
     * happens on a true holder crash — a lock that vanished with neither a
     * cached result nor a failure marker. Failed holders (LLM error etc.)
     * leave a marker, and waiters surface that error without re-running
     * the pipeline; a promoted waiter that fails writes the marker too,
     * so later waiters can't cascade into further promotions.
     */
    const waitAsStreamingWaiter = async (
      emit: (event: StreamEvent) => void
    ): Promise<WaiterOutcome> => {
      console.log(`[Etymology API] Waiting for in-flight result for "${normalizedWord}" (stream)`)
      const startedAt = Date.now()
      const { waiterPollIntervalMs, streamWaiterMaxWaitMs } = CONFIG.singleflight

      while (Date.now() - startedAt < streamWaiterMaxWaitMs) {
        await sleep(waiterPollIntervalMs)

        // A disconnected client can't receive the result — stop polling
        // (and never promote) so the function isn't kept alive for up to
        // 150s; the stream's abort handling closes things out.
        if (request.signal.aborted) {
          throw new DOMException('The operation was aborted', 'AbortError')
        }

        const result = await getCachedEtymology(normalizedWord, language)
        if (result) {
          return { kind: 'result', result }
        }

        if (await getNegativeCache(normalizedWord, language)) {
          return { kind: 'negative_cached' }
        }

        const promotion = await attemptPromotion(lockKey)
        if (promotion.status === 'holder_failed') {
          return { kind: 'holder_failed', message: promotion.message }
        }
        if (promotion.status === 'promoted') {
          console.log(`[Etymology API] Promoted waiter to holder for "${normalizedWord}"`)
          return runHolderPipeline(promotion.token, emit)
        }
        // 'held': holder still working (or another waiter won) — keep polling.

        emit({ type: 'singleflight_wait', waitedMs: Date.now() - startedAt })
      }

      return { kind: 'timeout' }
    }

    if (shouldStream) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          const emit = (event: StreamEvent) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            } catch {
              // Client disconnected mid-stream; request.signal stops the pipeline
            }
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
                  message:
                    language === 'en'
                      ? getQuirkyMessage('nonsense')
                      : `No ${LANGUAGES[language].englishName} entry was found for “${normalizedWord}”.`,
                  errorType: 'nonsense',
                })
              }
            } else if (outcome.kind === 'negative_cached') {
              emit({
                type: 'error',
                message:
                  language === 'en'
                    ? getQuirkyMessage('nonsense')
                    : `No ${LANGUAGES[language].englishName} entry was found for “${normalizedWord}”.`,
                errorType: 'nonsense',
              })
            } else if (outcome.kind === 'holder_failed') {
              emit({
                type: 'error',
                message: outcome.message,
                errorType: 'unknown',
              })
            } else {
              emit({
                type: 'error',
                message: IN_PROGRESS_MESSAGE,
                errorType: 'rate_limit',
              })
            }
          } catch (error) {
            if (request.signal.aborted) {
              console.log(
                `[Etymology API] Client disconnected for "${normalizedWord}" — pipeline aborted`
              )
            } else {
              console.error('[Etymology API] Streaming error:', safeError(error))
              await incrCounter('error')
              const classified = classifyApiError(error)
              emit({
                type: 'error',
                message: classified.message,
                errorType: classified.streamErrorType,
              })
            }
          }
          try {
            controller.close()
          } catch {
            // Already closed by client cancellation
          }
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
      const result = await pollForResult(() => getCachedEtymology(normalizedWord, language))
      if (result) {
        return respond.result(result, { cached: true })
      }
      return respond.error(IN_PROGRESS_MESSAGE, {
        status: 429,
        errorType: 'rate_limit',
        unaryHeaders: { 'Retry-After': '15' },
      })
    }

    console.log(`[Etymology API] Starting agentic research for "${normalizedWord}"`)
    const outcome = await runHolderPipeline(acquisition.token)

    if (outcome.kind === 'no_sources') {
      if (outcome.typoSuggestions && outcome.typoSuggestions.length > 0) {
        return respond.error(`Hmm, we couldn't find "${word}". Did you mean:`, {
          status: 404,
          errorType: 'typo',
          unaryData: { suggestions: outcome.typoSuggestions },
        })
      }
      return respond.error(
        language === 'en'
          ? getQuirkyMessage('nonsense')
          : `No ${LANGUAGES[language].englishName} entry was found for “${normalizedWord}”.`,
        {
          status: 404,
          errorType: 'nonsense',
          ...(language === 'en'
            ? { unaryData: { suggestion: outcome.fallbackSuggestion ?? getRandomWord() } }
            : {}),
        }
      )
    }

    return respond.result(outcome.result, {
      cached: false,
      headers: { 'X-Protection-Mode': costMode },
    })
  } catch (error) {
    if (request.signal.aborted) {
      // Client disconnected; the pipeline was aborted intentionally. Nobody
      // is listening, but return a response to satisfy the route contract.
      console.log('[Etymology API] Client disconnected — pipeline aborted')
      return new Response(null, { status: 499 })
    }

    console.error('Etymology API error:', safeError(error))
    await incrCounter('error')
    const classified = classifyApiError(error)

    return createResponseAdapter(shouldStream).error(classified.message, {
      status: classified.status,
      errorType: classified.streamErrorType,
    })
  }
}
