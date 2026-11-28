import { after, NextRequest, NextResponse } from 'next/server'
import { getWordSuggestionsWithMeta } from '@/lib/wordSuggestions'
import { ApiResponse, WordSuggestion } from '@/lib/types'
import { isValidWord, canonicalizeWord } from '@/lib/validation'
import { parseLanguageCode } from '@/lib/languages'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')
  const languageParam = searchParams.get('language')
  const language = languageParam ? parseLanguageCode(languageParam) : undefined

  if (language === null) {
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

  const { suggestions, complete } = await getWordSuggestionsWithMeta(
    normalized,
    language,
    false,
    request.signal,
    undefined,
    {
      deferCacheWrite: (write) => {
        try {
          after(write)
        } catch {
          void write()
        }
      },
    }
  )

  const cacheHeaders = {
    // Only cache complete suggestion sets; degraded upstream lookups stay no-store.
    'Cache-Control': complete
      ? 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
      : 'no-store',
    'X-Suggestions-Complete': complete ? '1' : '0',
  }

  return NextResponse.json<ApiResponse<{ suggestions: WordSuggestion[] }>>(
    {
      success: true,
      data: { suggestions },
    },
    { headers: cacheHeaders }
  )
}
