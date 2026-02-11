import { NextRequest, NextResponse } from 'next/server'
import { getSuggestions, isKnownWord } from '@/lib/spellcheck'
import { SuggestionsQuerySchema } from '@/lib/schemas/api'
import { ApiResponse, WordSuggestion } from '@/lib/types'

export async function GET(request: NextRequest) {
  const parsedQuery = SuggestionsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsedQuery.success) {
    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: parsedQuery.error.issues[0]?.message || 'Invalid query',
      },
      { status: 400 }
    )
  }
  const query = parsedQuery.data.q

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
