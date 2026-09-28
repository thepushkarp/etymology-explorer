'use client'

import { useEffect, useState } from 'react'
import { canonicalizeWord } from '@/lib/orthography'
import type { ApiResponse, WordSuggestion } from '@/lib/types'
import type { LanguageCode } from '@/lib/languages'

const MIN_QUERY_LENGTH = 2
const LIMIT = 6
const DEBOUNCE_MS = 150

export interface SuggestionFetchState {
  query: string
  language: LanguageCode | null
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
  language: LanguageCode
): string[] {
  if (fetched.language !== language) return []
  return fetched.query === normalizedQuery
    ? fetched.words
    : fetched.words.filter((word) => word.includes(normalizedQuery))
}

/** Debounced wordlist suggestions from /api/suggestions; stale requests are cancelled. */
export function useSuggestions(query: string, language: LanguageCode): string[] {
  const normalizedQuery = canonicalizeWord(query)
  const [fetched, setFetched] = useState<SuggestionFetchState>({
    query: '',
    language: null,
    words: [],
  })

  useEffect(() => {
    if (normalizedQuery.length < MIN_QUERY_LENGTH) return

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      fetch(`/api/suggestions?q=${encodeURIComponent(normalizedQuery)}&language=${language}`, {
        signal: controller.signal,
      })
        .then((response) =>
          response.ok
            ? (response.json() as Promise<ApiResponse<{ suggestions: WordSuggestion[] }>>)
            : null
        )
        .then((payload) => {
          if (payload?.success && payload.data) {
            setFetched({
              query: normalizedQuery,
              language,
              words: payload.data.suggestions.map((suggestion) => suggestion.word),
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
  }, [normalizedQuery, language])

  if (normalizedQuery.length < MIN_QUERY_LENGTH) return []
  return visibleFetchedWords(fetched, normalizedQuery, language).slice(0, LIMIT)
}
