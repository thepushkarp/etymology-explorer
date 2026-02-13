import { NextRequest, NextResponse } from 'next/server'
import {
  EtymologyResult,
  ApiResponse,
  StreamEvent,
  StageConfidence,
  ResearchContext,
} from '@/lib/types'
import { synthesizeFromResearch, streamSynthesis } from '@/lib/claude'
import { conductAgenticResearch } from '@/lib/research'
import { isLikelyTypo, getSuggestions } from '@/lib/spellcheck'
import { getRandomWord } from '@/lib/wordlist'
import { getQuirkyMessage } from '@/lib/prompts'
import { getCachedEtymology, cacheEtymology, getNegativeCache, cacheNegative } from '@/lib/cache'
import { isValidWord, canonicalizeWord } from '@/lib/validation'
import { reserveEtymologyBudget, getCostMode, recordSpend } from '@/lib/costGuard'
import { tryAcquireLock, releaseLock, pollForResult } from '@/lib/singleflight'
import { safeError } from '@/lib/errorUtils'
import { getEnv } from '@/lib/env'
import { CONFIG } from '@/lib/config'
import { emitSecurityEvent } from '@/lib/telemetry'

function countConfidence(result: EtymologyResult, level: StageConfidence): number {
  const allStages = [
    ...result.ancestryGraph.branches.flatMap((branch) => branch.stages),
    ...(result.ancestryGraph.postMerge ?? []),
  ]
  return allStages.filter((stage) => stage.confidence === level).length
}

export async function GET(request: NextRequest) {
  try {
    // Validate environment (lazy, cached after first call)
    try {
      getEnv()
    } catch {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Service configuration error' },
        { status: 503 }
      )
    }

    // Feature flags
    if (!CONFIG.features.publicSearchEnabled || CONFIG.features.forceCacheOnly) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Service temporarily unavailable' },
        { status: 503 }
      )
    }

    const word = request.nextUrl.searchParams.get('word')
    const shouldStream = request.nextUrl.searchParams.get('stream') === 'true'

    if (!word || typeof word !== 'string') {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Word is required' },
        { status: 400 }
      )
    }

    const normalizedWord = canonicalizeWord(word)

    if (!normalizedWord) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: getQuirkyMessage('empty') },
        { status: 400 }
      )
    }

    if (!isValidWord(normalizedWord)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: getQuirkyMessage('nonsense') },
        { status: 400 }
      )
    }

    const costMode = await getCostMode()

    // Always return JSON for cache hits (no point streaming cached data)
    const cached = await getCachedEtymology(normalizedWord)
    if (cached) {
      console.log(`[Etymology API] Cache hit for "${normalizedWord}"`)
      emitSecurityEvent({
        type: 'cache_hit',
        timestamp: Date.now(),
        detail: { word: normalizedWord },
      })
      return NextResponse.json<ApiResponse<EtymologyResult> & { cached: boolean }>(
        { success: true, data: cached, cached: true },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
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
      return NextResponse.json<ApiResponse<{ suggestion: string }>>(
        {
          success: false,
          error: getQuirkyMessage('nonsense'),
          data: { suggestion },
        },
        { status: 404 }
      )
    }

    // Reject uncached expensive requests when budget is pressured
    if (costMode === 'blocked') {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Service is at capacity for today. Please try again tomorrow.' },
        { status: 503, headers: { 'X-Protection-Mode': costMode } }
      )
    }
    if (costMode === 'cache_only' || costMode === 'protected_503') {
      emitSecurityEvent({
        type: 'budget_check',
        timestamp: Date.now(),
        detail: { word: normalizedWord, mode: costMode, action: 'rejected' },
      })
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Service temporarily unavailable' },
        { status: 503, headers: { 'X-Protection-Mode': costMode } }
      )
    }

    // Singleflight: prevent duplicate LLM calls for the same word
    const lockKey = `lock:etymology:${normalizedWord}`
    const acquiredLock = await tryAcquireLock(lockKey)

    if (!acquiredLock) {
      // Another request is already processing this word — poll for its result
      console.log(`[Etymology API] Waiting for in-flight result for "${normalizedWord}"`)
      const result = await pollForResult(() => getCachedEtymology(normalizedWord))
      if (result) {
        return NextResponse.json<ApiResponse<EtymologyResult> & { cached: boolean }>(
          { success: true, data: result, cached: true },
          {
            headers: {
              'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
            },
          }
        )
      }
      // Timed out waiting — tell client to retry
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Request in progress, please retry in a few seconds.' },
        { status: 429, headers: { 'Retry-After': '2' } }
      )
    }

    try {
      const budgetOk = await reserveEtymologyBudget()
      if (!budgetOk) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Service is at capacity for today. Please try again tomorrow.' },
          { status: 503 }
        )
      }

      const runResearch = async (
        onProgress?: (event: StreamEvent) => void
      ): Promise<
        | { kind: 'ok'; researchContext: ResearchContext }
        | { kind: 'no_sources'; typoSuggestions?: string[]; fallbackSuggestion?: string }
      > => {
        const researchContext = await conductAgenticResearch(
          normalizedWord,
          { skipOptionalSources: costMode === 'degraded' },
          onProgress
        )

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

      const recordUsage = (usage: { inputTokens: number; outputTokens: number }) => {
        recordSpend(usage).catch((err) => {
          console.error('[Etymology API] Spend recording failed:', safeError(err))
        })
      }

      const cacheAndAudit = (researchContext: ResearchContext, result: EtymologyResult) => {
        cacheEtymology(normalizedWord, result).catch((err) => {
          console.error('[Etymology API] Cache store failed:', safeError(err))
        })

        emitSecurityEvent({
          type: 'cache_miss',
          timestamp: Date.now(),
          detail: { word: normalizedWord, sources: researchContext.totalSourcesFetched },
        })
      }

      if (shouldStream) {
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()
            const emit = (event: StreamEvent) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            }

            try {
              console.log(
                `[Etymology API] Starting agentic research (streaming) for "${normalizedWord}"`
              )
              const research = await runResearch(emit)
              if (research.kind === 'no_sources') {
                if (research.typoSuggestions && research.typoSuggestions.length > 0) {
                  emit({
                    type: 'error',
                    message: `Hmm, we couldn't find "${word}". Did you mean: ${research.typoSuggestions.join(', ')}?`,
                    errorType: 'unknown',
                  })
                } else {
                  emit({
                    type: 'error',
                    message: getQuirkyMessage('nonsense'),
                    errorType: 'unknown',
                  })
                }
                controller.close()
                return
              }
              const researchContext = research.researchContext

              emit({ type: 'synthesis_started' })

              const { result, usage } = await streamSynthesis(researchContext, (token) => {
                emit({ type: 'synthesis_token', token })
              })

              recordUsage(usage)

              emit({
                type: 'enrichment_done',
                highConfidence: countConfidence(result, 'high'),
                mediumConfidence: countConfidence(result, 'medium'),
              })

              emit({ type: 'result', data: result })

              cacheAndAudit(researchContext, result)

              controller.close()
            } catch (error) {
              console.error('[Etymology API] Streaming error:', safeError(error))
              emit({
                type: 'error',
                message: 'An unexpected error occurred. Please try again.',
                errorType: 'unknown',
              })
              controller.close()
            } finally {
              // Release lock after stream completes
              releaseLock(lockKey).catch(() => {})
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
      } else {
        console.log(`[Etymology API] Starting agentic research for "${normalizedWord}"`)
        const research = await runResearch()
        if (research.kind === 'no_sources') {
          if (research.typoSuggestions && research.typoSuggestions.length > 0) {
            return NextResponse.json<ApiResponse<{ suggestions: string[] }>>(
              {
                success: false,
                error: `Hmm, we couldn't find "${word}". Did you mean:`,
                data: { suggestions: research.typoSuggestions },
              },
              { status: 404 }
            )
          }
          return NextResponse.json<ApiResponse<{ suggestion: string }>>(
            {
              success: false,
              error: getQuirkyMessage('nonsense'),
              data: { suggestion: research.fallbackSuggestion ?? getRandomWord() },
            },
            { status: 404 }
          )
        }
        const researchContext = research.researchContext

        const { result, usage } = await synthesizeFromResearch(researchContext)
        recordUsage(usage)
        cacheAndAudit(researchContext, result)

        return NextResponse.json<ApiResponse<EtymologyResult> & { cached: boolean }>(
          { success: true, data: result, cached: false },
          {
            headers: {
              'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
              'X-Protection-Mode': costMode,
            },
          }
        )
      }
    } finally {
      // Always release the lock for non-streaming path (streaming path releases in ReadableStream)
      if (!shouldStream) {
        releaseLock(lockKey).catch(() => {})
      }
    }
  } catch (error) {
    console.error('Etymology API error:', safeError(error))

    // Sanitized error responses — never expose raw error messages
    if (error instanceof Error) {
      if (
        error.message.includes('401') ||
        error.message.includes('invalid_api_key') ||
        error.message.includes('authentication_error')
      ) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Service temporarily unavailable' },
          { status: 503 }
        )
      }
      if (error.message.includes('429')) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Service is busy, please try again shortly' },
          { status: 429 }
        )
      }
    }

    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
