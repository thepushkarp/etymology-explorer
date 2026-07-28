'use client'

import { useEffect, useMemo, useState } from 'react'
import { rankMatches } from '@/lib/suggestionRanking'
import type { ApiResponse, WordSuggestion } from '@/lib/types'
import type { LanguageCode } from '@/lib/languages'

interface SearchSuggestionsProps {
  items: SuggestionItem[]
  isVisible: boolean
  onSelect: (word: string) => void
  selectedIndex: number
}

type SuggestionCategory = 'recent' | 'suggested'

export interface SuggestionItem {
  word: string
  category: SuggestionCategory
}

const RECENT_LIMIT = 3
const SUGGESTED_LIMIT = 5
export const MIN_QUERY_LENGTH = 2

/**
 * Suggestion items for a query: recent searches matched locally, wordlist
 * matches fetched from /api/suggestions (keeps the GRE wordlist out of the
 * client bundle). Callers pass an already-debounced query; stale requests
 * are cancelled, and previously fetched words that still match the query are
 * kept visible while the fresh response is in flight.
 */
export function useSuggestionItems(
  query: string,
  history: string[],
  language: LanguageCode = 'en'
): SuggestionItem[] {
  const normalizedQuery = query.toLowerCase().trim()
  const [fetched, setFetched] = useState<{ query: string; words: string[] }>({
    query: '',
    words: [],
  })

  useEffect(() => {
    if (normalizedQuery.length < MIN_QUERY_LENGTH) {
      return
    }

    const controller = new AbortController()

    fetch(`/api/suggestions?q=${encodeURIComponent(normalizedQuery)}&language=${language}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) return null
        return response.json() as Promise<ApiResponse<{ suggestions: WordSuggestion[] }>>
      })
      .then((payload) => {
        if (payload?.success && payload.data) {
          setFetched({
            query: normalizedQuery,
            words: payload.data.suggestions.map((suggestion) => suggestion.word),
          })
        }
      })
      .catch((fetchError) => {
        if ((fetchError as Error).name !== 'AbortError') {
          console.error('Failed to fetch search suggestions:', fetchError)
        }
      })

    return () => controller.abort()
  }, [normalizedQuery, language])

  return useMemo(() => {
    if (normalizedQuery.length < MIN_QUERY_LENGTH) {
      return []
    }

    const normalizedHistory = history
      .map((word) => word.toLowerCase().trim())
      .filter((word, index, allWords) => word.length > 0 && allWords.indexOf(word) === index)

    const recent = rankMatches(normalizedHistory, normalizedQuery, RECENT_LIMIT).map((word) => ({
      word,
      category: 'recent' as const,
    }))

    // Results for the current query are shown as-is (they may be typo
    // corrections that don't contain the query); results still in flight from
    // a previous query are only shown while they literally match the new one.
    const sourceWords =
      fetched.query === normalizedQuery
        ? fetched.words
        : fetched.words.filter((word) => word.includes(normalizedQuery))

    const recentWords = new Set(recent.map((item) => item.word))
    const suggested = sourceWords
      .filter((word) => !recentWords.has(word))
      .slice(0, SUGGESTED_LIMIT)
      .map((word) => ({ word, category: 'suggested' as const }))

    return [...recent, ...suggested]
  }, [normalizedQuery, history, fetched])
}

export function SearchSuggestions({
  items,
  isVisible,
  onSelect,
  selectedIndex,
}: SearchSuggestionsProps) {
  if (!isVisible || items.length === 0) {
    return null
  }

  const recentCount = items.filter((item) => item.category === 'recent').length

  return (
    <div
      className="
        absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-[1.4rem]
        border border-border-strong bg-surface shadow-[0_24px_60px_-34px_var(--shadow-color)]
        animate-fadeIn
      "
    >
      {recentCount > 0 && (
        <section className="border-b border-border-soft px-4 py-3">
          <h3 className="px-2 pb-2 text-[10px] uppercase tracking-[0.2em] text-charcoal-light/75">
            Recent
          </h3>
          <ul className="space-y-1">
            {items.slice(0, recentCount).map((item, index) => (
              <li key={`recent-${item.word}`}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelect(item.word)}
                  className={`
                    flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5
                    text-left font-serif text-base text-charcoal
                    transition-colors duration-150
                    ${selectedIndex === index ? 'bg-cream-dark/92' : 'hover:bg-cream-dark/45'}
                  `}
                >
                  <span className="truncate">{item.word}</span>
                  <span className="rounded-full border border-charcoal/14 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-charcoal-light/75">
                    Recent
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length > recentCount && (
        <section className="px-4 py-3">
          <h3 className="px-2 pb-2 text-[10px] uppercase tracking-[0.2em] text-charcoal-light/75">
            Suggestions
          </h3>
          <ul className="space-y-1">
            {items.slice(recentCount).map((item, index) => {
              const absoluteIndex = recentCount + index

              return (
                <li key={`suggested-${item.word}`}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelect(item.word)}
                    className={`
                      flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5
                      text-left font-serif text-base text-charcoal
                      transition-colors duration-150
                      ${
                        selectedIndex === absoluteIndex
                          ? 'bg-cream-dark/92'
                          : 'hover:bg-cream-dark/45'
                      }
                    `}
                  >
                    <span className="truncate">{item.word}</span>
                    <span className="rounded-full border border-charcoal/14 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-charcoal-light/75">
                      Suggested
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
