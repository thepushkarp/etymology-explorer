import { NextRequest, NextResponse } from 'next/server'
import { getWordSuggestions } from '@/lib/wordSuggestions'
import { ApiResponse, WordSuggestion } from '@/lib/types'
import { isValidWord, canonicalizeWord } from '@/lib/validation'
import { parseLanguageCode } from '@/lib/languages'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')
  const language = parseLanguageCode(searchParams.get('language'))

  if (!language) {
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Unsupported language' },
      { status: 400 }
    )
  }

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

  const suggestions = await getWordSuggestions(normalized, language, false, request.signal)

  return NextResponse.json<ApiResponse<{ suggestions: WordSuggestion[] }>>(
    {
      success: true,
      data: { suggestions },
    },
    { headers: cacheHeaders }
  )
}
