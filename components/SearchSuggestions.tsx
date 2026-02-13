'use client'

import greWordsData from '@/data/gre-words.json'

interface SearchSuggestionsProps {
  query: string
  history: string[]
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
const MIN_QUERY_LENGTH = 2
const WORDLIST: string[] = greWordsData.words

function rankMatches(words: string[], normalizedQuery: string, limit: number): string[] {
  const seen = new Set<string>()
  const prefixMatches: string[] = []
  const substringMatches: string[] = []

  for (const word of words) {
    if (seen.has(word)) {
      continue
    }

    if (word.startsWith(normalizedQuery)) {
      prefixMatches.push(word)
      seen.add(word)
    }
  }

  for (const word of words) {
    if (seen.has(word)) {
      continue
    }

    if (word.includes(normalizedQuery)) {
      substringMatches.push(word)
      seen.add(word)
    }
  }

  return [...prefixMatches, ...substringMatches].slice(0, limit)
}

export function getSuggestionItems(query: string, history: string[]): SuggestionItem[] {
  const normalizedQuery = query.toLowerCase().trim()

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

  const recentWords = new Set(recent.map((item) => item.word))
  const filteredWordlist = WORDLIST.filter((word) => !recentWords.has(word))

  const suggested = rankMatches(filteredWordlist, normalizedQuery, SUGGESTED_LIMIT).map((word) => ({
    word,
    category: 'suggested' as const,
  }))

  return [...recent, ...suggested]
}

export function SearchSuggestions({
  query,
  history,
  isVisible,
  onSelect,
  selectedIndex,
}: SearchSuggestionsProps) {
  if (!isVisible) {
    return null
  }

  const suggestions = getSuggestionItems(query, history)
  if (suggestions.length === 0) {
    return null
  }

  const recentCount = suggestions.filter((item) => item.category === 'recent').length

  return (
    <div
      className="
        absolute left-0 right-0 top-full z-50
        bg-cream border border-charcoal/15 border-t-charcoal/20 border-t
        rounded-b-lg rounded-t-none
        max-h-80 overflow-y-auto
        animate-fadeIn
        opacity-100 translate-y-0
        transition-all duration-200 ease-out
      "
    >
      {recentCount > 0 && (
        <section className="px-3 py-2 border-b border-charcoal/10">
          <h3 className="px-2 pb-2 text-[10px] uppercase tracking-[0.16em] text-charcoal-light/75">
            Recent
          </h3>
          <ul className="space-y-1">
            {suggestions.slice(0, recentCount).map((item, index) => (
              <li key={`recent-${item.word}`}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelect(item.word)}
                  className={`
                    w-full flex items-center justify-between gap-3 px-2 py-2
                    text-left font-serif text-base text-charcoal
                    transition-colors duration-150
                    ${selectedIndex === index ? 'bg-cream-dark/80' : 'hover:bg-cream-dark/45'}
                  `}
                >
                  <span className="truncate">{item.word}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em] border border-charcoal/20 px-2 py-0.5 text-charcoal-light/75">
                    Recent
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestions.length > recentCount && (
        <section className="px-3 py-2">
          <h3 className="px-2 pb-2 text-[10px] uppercase tracking-[0.16em] text-charcoal-light/75">
            Suggestions
          </h3>
          <ul className="space-y-1">
            {suggestions.slice(recentCount).map((item, index) => {
              const absoluteIndex = recentCount + index

              return (
                <li key={`suggested-${item.word}`}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelect(item.word)}
                    className={`
                      w-full flex items-center justify-between gap-3 px-2 py-2
                      text-left font-serif text-base text-charcoal
                      transition-colors duration-150
                      ${selectedIndex === absoluteIndex ? 'bg-cream-dark/80' : 'hover:bg-cream-dark/45'}
                    `}
                  >
                    <span className="truncate">{item.word}</span>
                    <span className="text-[10px] uppercase tracking-[0.12em] border border-charcoal/20 px-2 py-0.5 text-charcoal-light/75">
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
