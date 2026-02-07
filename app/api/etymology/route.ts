import { NextRequest, NextResponse } from 'next/server'
import { EtymologyResult, ApiResponse } from '@/lib/types'
import { synthesizeFromResearch } from '@/lib/claude'
import { conductAgenticResearch } from '@/lib/research'
import { isLikelyTypo, getSuggestions } from '@/lib/spellcheck'
import { getRandomWord } from '@/lib/wordlist'
import { getQuirkyMessage } from '@/lib/prompts'
import { getCachedEtymology, cacheEtymology } from '@/lib/cache'
import { isValidWord } from '@/lib/validation'
import { checkEtymologyBudget, incrementEtymologyBudget } from '@/lib/costGuard'

export async function GET(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
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

    // Check daily budget (only for uncached requests)
    const budgetOk = await checkEtymologyBudget()
    if (!budgetOk) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Service is at capacity for today. Please try again tomorrow.' },
        { status: 503 }
      )
    }

    // Conduct agentic research
    console.log(`[Etymology API] Starting agentic research for "${normalizedWord}"`)
    const researchContext = await conductAgenticResearch(normalizedWord)

    // If no source data found, check if it's a typo
    if (!researchContext.mainWord.etymonline && !researchContext.mainWord.wiktionary) {
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
    const result = await synthesizeFromResearch(researchContext)

    // Increment budget counter (non-blocking)
    incrementEtymologyBudget().catch((err) => {
      console.error('[Etymology API] Budget increment failed:', err)
    })

    // Cache result for future lookups (non-blocking)
    cacheEtymology(normalizedWord, result).catch((err) => {
      console.error('[Etymology API] Cache store failed:', err)
    })

    return NextResponse.json<ApiResponse<EtymologyResult> & { cached: boolean }>(
      { success: true, data: result, cached: false },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      }
    )
  } catch (error) {
    console.error('Etymology API error:', error)

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
