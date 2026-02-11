import { NextRequest, NextResponse } from 'next/server'
import { getSuggestions, isKnownWord } from '@/lib/spellcheck'
import { ApiResponse, WordSuggestion } from '@/lib/types'
import { isValidWord, canonicalizeWord } from '@/lib/validation'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')

  if (!query) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: 'Query parameter "q" is required',
      },
      { status: 400 }
    )
  }

  const normalized = canonicalizeWord(query)

  if (!normalized || !isValidWord(normalized)) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Invalid query' },
      { status: 400 }
    )
  }

  const cacheHeaders = {
    'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
  }

  // If it's a known word, return it as the only suggestion
  if (isKnownWord(normalized)) {
    return NextResponse.json<ApiResponse<{ suggestions: WordSuggestion[] }>>(
      {
        success: true,
        data: {
          suggestions: [{ word: normalized, distance: 0 }],
        },
      },
      { headers: cacheHeaders }
    )
  }

  const suggestions = getSuggestions(normalized)

  return NextResponse.json<ApiResponse<{ suggestions: WordSuggestion[] }>>(
    {
      success: true,
      data: { suggestions },
    },
    { headers: cacheHeaders }
  )
}
