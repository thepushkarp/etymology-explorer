import { NextRequest, NextResponse } from 'next/server'
import { getAutocompleteSuggestions } from '@/lib/spellcheck'
import { ApiResponse, WordSuggestion } from '@/lib/types'
import { isValidWord, canonicalizeWord } from '@/lib/validation'
import { LANGUAGES, parseLanguageCode } from '@/lib/languages'
import { fetchWithTimeout } from '@/lib/fetchUtils'
import { CONFIG } from '@/lib/config'
import { resolveJapaneseLexeme } from '@/lib/japanese/resolver'

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

  let suggestions: WordSuggestion[]
  if (language === 'en') {
    suggestions = getAutocompleteSuggestions(normalized)
  } else if (language === 'ja') {
    const resolution = await resolveJapaneseLexeme(normalized)
    suggestions = resolution.candidates
      .filter(
        (candidate, index, candidates) =>
          candidates.findIndex((item) => item.lemma === candidate.lemma) === index
      )
      .map((candidate) => ({
        word: candidate.lemma,
        distance: 0,
        entryId: candidate.entryId,
        reading: candidate.reading,
        romaji: candidate.romaji,
        gloss: candidate.gloss,
        partOfSpeech: candidate.partOfSpeech,
      }))
  } else {
    const url = new URL(`https://${LANGUAGES[language].wiktionaryEdition}.wiktionary.org/w/api.php`)
    url.searchParams.set('action', 'opensearch')
    url.searchParams.set('search', normalized)
    url.searchParams.set('limit', '8')
    url.searchParams.set('namespace', '0')
    url.searchParams.set('format', 'json')
    url.searchParams.set('origin', '*')
    try {
      const response = await fetchWithTimeout(url, {}, CONFIG.timeouts.source)
      const data = response.ok ? ((await response.json()) as unknown[]) : []
      const words = Array.isArray(data[1]) ? (data[1] as string[]) : []
      suggestions = words.map((word) => ({ word, distance: 0 }))
    } catch {
      suggestions = []
    }
  }

  return NextResponse.json<ApiResponse<{ suggestions: WordSuggestion[] }>>(
    {
      success: true,
      data: { suggestions },
    },
    { headers: cacheHeaders }
  )
}
