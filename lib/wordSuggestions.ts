import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { fetchWithTimeout } from './fetchUtils'
import { LANGUAGES, type LanguageCode } from './languages'
import { canonicalizeWord, sameSpelling } from './orthography'
import { getAutocompleteSuggestions, getSuggestions } from './spellcheck'
import { isValidWord } from './validation'
import type { WordSuggestion } from './types'

/** Broader spelling searches produce choices only; they never supply lexical evidence. */
export async function getWordSuggestions(
  query: string,
  language: LanguageCode,
  alternativesOnly = false,
  signal?: AbortSignal
): Promise<WordSuggestion[]> {
  const normalized = canonicalizeWord(query)
  if (language === 'en') {
    return alternativesOnly ? getSuggestions(normalized) : getAutocompleteSuggestions(normalized)
  }

  const searchTerms = new Set([
    normalized,
    normalized.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’ʼ]/g, "'"),
  ])
  const results = await Promise.all(
    [...searchTerms].map(async (term) => {
      const url = new URL(
        `https://${LANGUAGES[language].wiktionaryEdition}.wiktionary.org/w/api.php`
      )
      url.searchParams.set('action', 'opensearch')
      url.searchParams.set('search', term)
      url.searchParams.set('limit', '8')
      url.searchParams.set('namespace', '0')
      url.searchParams.set('format', 'json')
      url.searchParams.set('origin', '*')
      try {
        const response = await fetchWithTimeout(url, {}, CONFIG.timeouts.source, signal)
        if (!response.ok)
          throw new Error(`Wiktionary spelling suggestions: HTTP ${response.status}`)
        const data: unknown = await response.json()
        return Array.isArray(data) && Array.isArray(data[1]) ? (data[1] as unknown[]) : []
      } catch (error) {
        if (signal?.aborted) throw error
        console.error('Spelling suggestions failed:', safeError(error))
        return []
      }
    })
  )
  return [
    ...new Set(
      results
        .flat()
        .filter((word): word is string => typeof word === 'string')
        .map(canonicalizeWord)
    ),
  ]
    .filter((word) => isValidWord(word) && (!alternativesOnly || !sameSpelling(word, normalized)))
    .sort(
      (left, right) =>
        Number(sameSpelling(right, normalized)) - Number(sameSpelling(left, normalized))
    )
    .slice(0, alternativesOnly ? 3 : 8)
    .map((word) => ({ word, distance: sameSpelling(word, normalized) ? 0 : 1 }))
}
