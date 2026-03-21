'use client'

import { memo } from 'react'
import { Root } from '@/lib/types'

interface RelatedWordsListProps {
  roots: Root[]
  onWordClick: (word: string) => void
}

type WordCategory = 'cognates' | 'derived' | 'related'

interface CategorizedWords {
  cognates: string[]
  derived: string[]
  related: string[]
}

/**
 * Categorize a word based on simple heuristics
 * - Cognates: contain parentheses (language tags) or non-ASCII chars
 * - Derived: English words (ASCII, no parens)
 * - Related: fallback for ambiguous cases
 */
function categorizeWord(word: string): WordCategory {
  // Check for language tags in parentheses: "word (French)", "mot (Latin)"
  if (/\([A-Z][a-z]+\)/.test(word)) {
    return 'cognates'
  }

  // Check for non-ASCII characters (other language scripts)
  if (/[^\x00-\x7F]/.test(word)) {
    return 'cognates'
  }

  // Check for reconstructed forms (PIE, Proto-*, etc.)
  if (/^\*|Proto-|PIE/.test(word)) {
    return 'cognates'
  }

  // Default to derived for ASCII English words
  return 'derived'
}

/**
 * Group related words by category
 */
function groupWordsByCategory(words: string[]): CategorizedWords {
  return words.reduce(
    (acc, word) => {
      const category = categorizeWord(word)
      acc[category].push(word)
      return acc
    },
    { cognates: [], derived: [], related: [] } as CategorizedWords
  )
}

/**
 * Category metadata for display
 */
const CATEGORY_META: Record<WordCategory, { label: string; description: string; order: number }> = {
  cognates: {
    label: 'Cognates',
    description: 'Related words in other languages',
    order: 1,
  },
  derived: {
    label: 'Derived Terms',
    description: 'English words from this root',
    order: 2,
  },
  related: {
    label: 'Related Concepts',
    description: 'Semantically related terms',
    order: 3,
  },
}

export const RelatedWordsList = memo(function RelatedWordsList({
  roots,
  onWordClick,
}: RelatedWordsListProps) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      {roots.map((root, rootIndex) => {
        const grouped = groupWordsByCategory(root.relatedWords)
        const categories = (['cognates', 'derived', 'related'] as WordCategory[]).filter(
          (cat) => grouped[cat].length > 0
        )

        return (
          <div
            key={`${root.root}-${rootIndex}`}
            className="animate-fadeIn rounded-[1.6rem] border border-border-soft bg-cream-dark/18 p-5"
            style={{ animationDelay: `${rootIndex * 100}ms` }}
          >
            <h3
              className="
              mb-4 border-b border-border-soft pb-3 font-serif text-sm text-charcoal-light
            "
            >
              From{' '}
              <span className="font-semibold text-charcoal italic">&apos;{root.root}&apos;</span>
              <span className="text-charcoal/55 mx-2">·</span>
              <span className="text-charcoal/60">{root.meaning}</span>
            </h3>

            <div className="space-y-6">
              {categories.map((category, categoryIndex) => {
                const words = grouped[category]
                const meta = CATEGORY_META[category]

                return (
                  <div
                    key={category}
                    style={{
                      animationDelay: `${rootIndex * 100 + categoryIndex * 80}ms`,
                    }}
                  >
                    <div className="mb-2">
                      <h4
                        className="
                        mb-1 text-xs uppercase tracking-[0.16em] text-charcoal/50
                      "
                      >
                        {meta.label}
                      </h4>
                      <p className="text-xs text-charcoal/55 italic">{meta.description}</p>
                    </div>

                    <ul className="space-y-1">
                      {words.map((word, wordIndex) => (
                        <li key={`${root.root}-${category}-${word}-${wordIndex}`}>
                          <button
                            onClick={() => onWordClick(word)}
                            className="
                              group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left font-serif
                              transition-all duration-200 hover:bg-surface hover:shadow-sm
                            "
                            style={{
                              animationDelay: `${
                                rootIndex * 100 + categoryIndex * 80 + wordIndex * 30
                              }ms`,
                            }}
                          >
                            <span
                              className="
                              text-charcoal-light/55 transition-all duration-200 group-hover:translate-x-1
                              group-hover:text-charcoal
                            "
                            >
                              →
                            </span>

                            <span
                              className="
                              transition-colors duration-200 group-hover:text-charcoal group-hover:underline
                              decoration-charcoal/30 underline-offset-4
                            "
                            >
                              {word}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
})
