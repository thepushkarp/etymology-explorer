import { NextRequest, NextResponse } from 'next/server'
import { EtymologyRequest, EtymologyResult, ApiResponse } from '@/lib/types'
import { fetchWiktionary } from '@/lib/wiktionary'
import { fetchEtymonline } from '@/lib/etymonline'
import { synthesizeEtymology } from '@/lib/claude'
import { isLikelyTypo, getSuggestions } from '@/lib/spellcheck'
import { getRandomWord } from '@/lib/wordlist'
import { getQuirkyMessage } from '@/lib/prompts'

export async function POST(request: NextRequest) {
  try {
    const body: EtymologyRequest = await request.json()
    const { word, apiKey } = body

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

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: 'API key is required',
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

    // Fetch from sources in parallel
    const [etymonlineData, wiktionaryData] = await Promise.all([
      fetchEtymonline(normalizedWord),
      fetchWiktionary(normalizedWord),
    ])

    // If no source data found, check if it's a typo
    if (!etymonlineData && !wiktionaryData) {
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

    // Synthesize with Claude
    const result = await synthesizeEtymology(
      normalizedWord,
      { etymonline: etymonlineData, wiktionary: wiktionaryData },
      apiKey
    )

    return NextResponse.json<ApiResponse<EtymologyResult>>({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Etymology API error:', error)

    // Check for Anthropic API errors
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('invalid_api_key')) {
        return NextResponse.json<ApiResponse<null>>(
          {
            success: false,
            error: 'Invalid API key. Please check your Anthropic API key in settings.',
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
