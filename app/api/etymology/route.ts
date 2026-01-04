import { NextRequest, NextResponse } from 'next/server'
import { EtymologyRequest, EtymologyResult, ApiResponse, LLMConfig } from '@/lib/types'
import { synthesizeFromResearch } from '@/lib/claude'
import { conductAgenticResearch } from '@/lib/research'
import { isLikelyTypo, getSuggestions } from '@/lib/spellcheck'
import { getRandomWord } from '@/lib/wordlist'
import { getQuirkyMessage } from '@/lib/prompts'

function isValidLLMConfig(config: LLMConfig): boolean {
  if (config.provider === 'anthropic') {
    return typeof config.anthropicApiKey === 'string' && config.anthropicApiKey.length > 0
  }
  return (
    typeof config.openrouterApiKey === 'string' &&
    config.openrouterApiKey.length > 0 &&
    typeof config.openrouterModel === 'string' &&
    config.openrouterModel.length > 0
  )
}

export async function POST(request: NextRequest) {
  try {
    const body: EtymologyRequest = await request.json()
    const { word, llmConfig } = body

    // Validate inputs
    if (!word || typeof word !== 'string') {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: 'Word is required',
        },
        { status: 400 }
      )
    }

    if (!llmConfig || !isValidLLMConfig(llmConfig)) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: 'Valid LLM configuration is required',
        },
        { status: 400 }
      )
    }

    const normalizedWord = word.toLowerCase().trim()

    // Check if it's empty
    if (!normalizedWord) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: getQuirkyMessage('empty'),
        },
        { status: 400 }
      )
    }

    // Check if it looks like nonsense or a typo
    const looksLikeWord = /^[a-zA-Z]+$/.test(normalizedWord)
    if (!looksLikeWord) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: getQuirkyMessage('nonsense'),
        },
        { status: 400 }
      )
    }

    // Conduct agentic research (fetches main word, extracts roots, explores related terms)
    console.log(`[Etymology API] Starting agentic research for "${normalizedWord}"`)
    const researchContext = await conductAgenticResearch(normalizedWord, llmConfig)

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
        // True nonsense - suggest a random word
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

    // Synthesize with LLM using rich research context
    const result = await synthesizeFromResearch(researchContext, llmConfig)

    return NextResponse.json<ApiResponse<EtymologyResult>>({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Etymology API error:', error)

    // Check for LLM API errors
    if (error instanceof Error) {
      // Check for authentication errors (be specific to avoid false positives)
      if (
        error.message.includes('401') ||
        error.message.includes('invalid_api_key') ||
        error.message.includes('Invalid API key') ||
        error.message.includes('authentication_error')
      ) {
        return NextResponse.json<ApiResponse<null>>(
          {
            success: false,
            error: 'Invalid API key. Please check your API key in settings.',
          },
          { status: 401 }
        )
      }
      if (error.message.includes('429')) {
        return NextResponse.json<ApiResponse<null>>(
          {
            success: false,
            error: 'Rate limit exceeded. Please wait a moment and try again.',
          },
          { status: 429 }
        )
      }
      if (error.message.includes('OpenRouter')) {
        return NextResponse.json<ApiResponse<null>>(
          {
            success: false,
            error: error.message,
          },
          { status: 500 }
        )
      }
      // Return the actual error message for debugging
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
      },
      { status: 500 }
    )
  }
}
