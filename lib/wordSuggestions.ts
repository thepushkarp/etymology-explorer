import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { fetchWithTimeout } from './fetchUtils'
import { LANGUAGES, type LanguageCode } from './languages'
import { canonicalizeWord, sameSpelling } from './orthography'
import { getRedis } from './redis'
import { getAutocompleteSuggestions, getSuggestions } from './spellcheck'
import { isValidWord } from './validation'
import type { WordSuggestion } from './types'

export interface SuggestionCacheRedis {
  get(key: string): Promise<unknown>
  set(key: string, value: WordSuggestion[], options: { ex: number }): Promise<unknown>
}

const MIN_QUERY_LENGTH = 2
const SUGGESTION_LIMIT = 8
const CACHE_TTL = 86400

function isSuggestionList(value: unknown): value is WordSuggestion[] {
  return (
    Array.isArray(value) &&
    value.length <= SUGGESTION_LIMIT &&
    value.every(
      (item) =>
        item &&
        typeof item.word === 'string' &&
        isValidWord(item.word) &&
        canonicalizeWord(item.word) === item.word &&
        Number.isInteger(item.distance) &&
        item.distance >= 0
    )
  )
}

/** Broader spelling searches produce choices only; they never supply lexical evidence. */
export async function getWordSuggestions(
  query: string,
  language?: LanguageCode,
  alternativesOnly = false,
  signal?: AbortSignal,
  client: SuggestionCacheRedis | null = getRedis()
): Promise<WordSuggestion[]> {
  const normalized = canonicalizeWord(query)
  signal?.throwIfAborted()
  if (normalized.length < MIN_QUERY_LENGTH || !isValidWord(normalized)) return []
  if (language === 'en' && alternativesOnly) return getSuggestions(normalized)

  // Alternative spelling searches and prefix autocomplete have different rankings.
  // Only autocomplete uses the prefix cache so neither mode can overwrite the other.
  const cacheKey = `suggest:v1:${language ?? 'auto'}:${normalized}`
  if (client && !alternativesOnly) {
    try {
      const cached = await client.get(cacheKey)
      signal?.throwIfAborted()
      if (isSuggestionList(cached)) return cached
    } catch (error) {
      if (signal?.aborted) throw error
      console.error('Suggestion cache read failed:', safeError(error))
    }
  }

  const useEnglish = !language || language === 'en'
  const latinQuery =
    /\p{Script=Latin}/u.test(normalized) && !/[^\p{Script=Latin}\p{M}\s'’ʼ‐‑-]/u.test(normalized)
  const local =
    useEnglish && latinQuery
      ? alternativesOnly
        ? getSuggestions(normalized)
        : getAutocompleteSuggestions(normalized, SUGGESTION_LIMIT)
      : []
  const edition = language ? (LANGUAGES[language].nativeWiktionary?.edition ?? 'en') : 'en'
  const searchTerms = new Set([normalized])
  // Latin accents may broaden spelling choices. Removing marks in other scripts
  // can remove vowel signs and change the requested word instead.
  if (latinQuery) {
    searchTerms.add(normalized.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’ʼ]/g, "'"))
  }
  const results = await Promise.all(
    [...searchTerms].map(async (term) => {
      const url = new URL(`https://${edition}.wiktionary.org/w/api.php`)
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
        if (!Array.isArray(data) || !Array.isArray(data[1])) {
          throw new Error('Wiktionary spelling suggestions: invalid opensearch response')
        }
        return data[1] as unknown[]
      } catch (error) {
        if (signal?.aborted) throw error
        console.error('Spelling suggestions failed:', safeError(error))
        return null
      }
    })
  )
  const remote = [
    ...new Set(
      results
        .flatMap((result) => result ?? [])
        .filter((word): word is string => typeof word === 'string')
        .map(canonicalizeWord)
    ),
  ]
    .filter((word) => isValidWord(word) && (!alternativesOnly || !sameSpelling(word, normalized)))
    .sort(
      (left, right) =>
        Number(sameSpelling(right, normalized)) - Number(sameSpelling(left, normalized))
    )
    .map((word) => ({ word, distance: sameSpelling(word, normalized) ? 0 : 1 }))

  const prefixes = local.filter(({ word }) => word.startsWith(normalized))
  const seen = new Set<string>()
  const suggestions = [...prefixes, ...remote, ...local]
    .filter(({ word }) => {
      if (seen.has(word)) return false
      seen.add(word)
      return true
    })
    .slice(0, alternativesOnly ? 3 : SUGGESTION_LIMIT)

  signal?.throwIfAborted()
  // A partial or failed lookup must not hide a recovered provider for a full day.
  if (client && !alternativesOnly && results.every((result) => result !== null)) {
    try {
      await client.set(cacheKey, suggestions, { ex: CACHE_TTL })
    } catch (error) {
      console.error('Suggestion cache write failed:', safeError(error))
    }
  }
  return suggestions
}
