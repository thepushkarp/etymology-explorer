import { NextRequest, NextResponse } from 'next/server'
import { getSuggestions, isKnownWord } from '@/lib/spellcheck'
import { ApiResponse, WordSuggestion } from '@/lib/types'
import { CONFIG } from '@/lib/config'

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

  if (query.length > CONFIG.maxWordLength) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Query too long' },
      { status: 400 }
    )
  }

  const cacheHeaders = {
    'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
  }

  // If it's a known word, return it as the only suggestion
  if (isKnownWord(query)) {
    return NextResponse.json<ApiResponse<{ suggestions: WordSuggestion[] }>>(
      {
        success: true,
        data: {
          suggestions: [{ word: query.toLowerCase(), distance: 0 }],
        },
      },
      { headers: cacheHeaders }
    )
  }

  const suggestions = getSuggestions(query)

  return NextResponse.json<ApiResponse<{ suggestions: WordSuggestion[] }>>(
    {
      success: true,
      data: { suggestions },
    },
    { headers: cacheHeaders }
  )
}
