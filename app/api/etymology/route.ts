import { NextRequest, NextResponse } from 'next/server'
import { EtymologyResult, ApiResponse } from '@/lib/types'
import { synthesizeFromResearch } from '@/lib/claude'
import { conductAgenticResearch } from '@/lib/research'
import { isLikelyTypo, getSuggestions } from '@/lib/spellcheck'
import { getRandomWord } from '@/lib/wordlist'
import { getQuirkyMessage } from '@/lib/prompts'
import { getCachedEtymology, cacheEtymology, getNegativeCache, cacheNegative } from '@/lib/cache'
import { isValidWord } from '@/lib/validation'
import { reserveEtymologyBudget, getCostMode, recordSpend } from '@/lib/costGuard'
import { tryAcquireLock, releaseLock, pollForResult } from '@/lib/singleflight'
import { safeError } from '@/lib/errorUtils'
import { getEnv } from '@/lib/env'
import { CONFIG } from '@/lib/config'

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

    if (!word || typeof word !== 'string') {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Word is required' },
        { status: 400 }
      )
    }

    const normalizedWord = word.toLowerCase().trim()

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

    // Check cache first (cache hits are free — no budget cost)
    const cached = await getCachedEtymology(normalizedWord)
    if (cached) {
      console.log(`[Etymology API] Cache hit for "${normalizedWord}"`)
      return NextResponse.json<ApiResponse<EtymologyResult> & { cached: boolean }>(
        { success: true, data: cached, cached: true },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
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

    // Atomically reserve a budget slot (INCR then compare — no TOCTOU race)
    const budgetOk = await reserveEtymologyBudget()
    if (!budgetOk) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Service is at capacity for today. Please try again tomorrow.' },
        { status: 503 }
      )
    }

    // Check cost mode for gradual degradation
    const costMode = await getCostMode()
    if (costMode === 'blocked') {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Service is at capacity for today. Please try again tomorrow.' },
        { status: 503 }
      )
    }
    if (costMode === 'cache_only') {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Service is in cache-only mode. Please try again later.' },
        { status: 503 }
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

    // We hold the lock — do the actual work
    try {
      // Conduct agentic research
      console.log(`[Etymology API] Starting agentic research for "${normalizedWord}"`)
      const researchContext = await conductAgenticResearch(
        normalizedWord,
        costMode === 'degraded' ? { skipOptionalSources: true } : undefined
      )

      // If no source data found, check if it's a typo
      if (!researchContext.mainWord.etymonline && !researchContext.mainWord.wiktionary) {
        // Cache as negative so gibberish doesn't trigger source fetches again
        cacheNegative(normalizedWord).catch((err) => {
          console.error('[Etymology API] Negative cache store failed:', safeError(err))
        })

        if (isLikelyTypo(normalizedWord)) {
          const suggestions = getSuggestions(normalizedWord)
          return NextResponse.json<ApiResponse<{ suggestions: string[] }>>(
            {
              success: false,
              error: `Hmm, we couldn't find "${word}". Did you mean:`,
              data: { suggestions: suggestions.map((s) => s.word) },
            },
            { status: 404 }
          )
        } else {
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
      }

      console.log(
        `[Etymology API] Research complete. Fetched ${researchContext.totalSourcesFetched} sources, ` +
          `identified ${researchContext.identifiedRoots.length} roots`
      )

      // Synthesize with LLM
      const { result, usage } = await synthesizeFromResearch(researchContext)

      // Record actual USD spend
      recordSpend(usage).catch((err) => {
        console.error('[Etymology API] Spend recording failed:', safeError(err))
      })

      // Cache result for future lookups (non-blocking)
      cacheEtymology(normalizedWord, result).catch((err) => {
        console.error('[Etymology API] Cache store failed:', safeError(err))
      })

      return NextResponse.json<ApiResponse<EtymologyResult> & { cached: boolean }>(
        { success: true, data: result, cached: false },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
          },
        }
      )
    } finally {
      // Always release the lock so other requests aren't stuck waiting
      releaseLock(lockKey).catch(() => {})
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
