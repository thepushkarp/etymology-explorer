'use client'

import { useEffect, useState } from 'react'
import { canonicalizeWord, isValidWord } from '@/lib/validation'
import type { ApiResponse, WordSuggestion } from '@/lib/types'
import type { LanguageCode } from '@/lib/languages'

const MIN_QUERY_LENGTH = 2
const LIMIT = 6
const DEBOUNCE_MS = 150
const MAX_CACHED_QUERIES = 50
const SUGGESTION_CACHE_TTL_MS = 60_000
const EMPTY_SUGGESTIONS: string[] = []

const suggestionCache = new Map<string, { words: string[]; expiresAt: number }>()

function cacheKey(query: string, language?: LanguageCode): string {
  return `${language ?? 'auto'}:${query}`
}

function getCachedSuggestions(query: string, language?: LanguageCode): string[] | undefined {
  const key = cacheKey(query, language)
  const hit = suggestionCache.get(key)
  if (!hit) return undefined
  if (Date.now() > hit.expiresAt) {
    suggestionCache.delete(key)
    return undefined
  }
  suggestionCache.delete(key)
  suggestionCache.set(key, hit)
  return hit.words
}

function setCachedSuggestions(query: string, language: LanguageCode | undefined, words: string[]) {
  const key = cacheKey(query, language)
  suggestionCache.delete(key)
  if (suggestionCache.size >= MAX_CACHED_QUERIES) {
    const oldest = suggestionCache.keys().next().value
    if (oldest !== undefined) suggestionCache.delete(oldest)
  }
  suggestionCache.set(key, { words, expiresAt: Date.now() + SUGGESTION_CACHE_TTL_MS })
}

export interface SuggestionFetchState {
  query: string
  language: LanguageCode | undefined
  words: string[]
}

/**
 * Results for the current query are shown as-is (they may be typo corrections
 * that don't contain the query); results still in flight from a previous query
 * are only shown while they literally match the new one.
 */
export function visibleFetchedWords(
  fetched: SuggestionFetchState,
  normalizedQuery: string,
  language?: LanguageCode
): string[] {
  if (fetched.language !== language) return []
  return fetched.query === normalizedQuery
    ? fetched.words
    : fetched.words.filter((word) => word.includes(normalizedQuery))
}

export function useSuggestions(query: string, language?: LanguageCode): string[] {
  const normalizedQuery = canonicalizeWord(query)
  const valid = normalizedQuery.length >= MIN_QUERY_LENGTH && isValidWord(normalizedQuery)
  const cached = valid ? getCachedSuggestions(normalizedQuery, language) : undefined
  const [fetched, setFetched] = useState<SuggestionFetchState>({
    query: '',
    language: undefined,
    words: EMPTY_SUGGESTIONS,
  })

  useEffect(() => {
    if (!valid || getCachedSuggestions(normalizedQuery, language) !== undefined) return

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      const params = new URLSearchParams({ q: normalizedQuery })
      if (language) params.set('language', language)
      fetch(`/api/suggestions?${params}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return null
          const complete = response.headers.get('x-suggestions-complete') !== '0'
          const payload = (await response.json()) as ApiResponse<{ suggestions: WordSuggestion[] }>
          return { payload, complete }
        })
        .then((result) => {
          if (!controller.signal.aborted && result?.payload?.success && result.payload.data) {
            const words = result.payload.data.suggestions.map((suggestion) => suggestion.word)
            if (result.complete && words.length > 0)
              setCachedSuggestions(normalizedQuery, language, words)
            setFetched({
              query: normalizedQuery,
              language,
              words,
            })
          }
        })
        .catch(() => {
          // Aborted or offline: suggestions are optional.
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [normalizedQuery, language, valid])

  if (!valid) return EMPTY_SUGGESTIONS
  if (cached) return cached.slice(0, LIMIT)
  return visibleFetchedWords(fetched, normalizedQuery, language).slice(0, LIMIT)
}
