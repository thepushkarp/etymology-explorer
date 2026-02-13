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
            className="animate-fadeIn"
            style={{ animationDelay: `${rootIndex * 100}ms` }}
          >
            {/* Section header - styled like dictionary sub-entries */}
            <h3
              className="
              font-serif text-sm
              text-charcoal-light
              mb-4 pb-2
              border-b border-charcoal/10
            "
            >
              From{' '}
              <span className="font-semibold text-charcoal italic">&apos;{root.root}&apos;</span>
              <span className="text-charcoal/55 mx-2">·</span>
              <span className="text-charcoal/60">{root.meaning}</span>
            </h3>

            {/* Grouped categories */}
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
                    {/* Category label */}
                    <div className="mb-2">
                      <h4
                        className="
                        font-serif text-xs
                        text-charcoal/50
                        uppercase tracking-wider
                        mb-1
                      "
                      >
                        {meta.label}
                      </h4>
                      <p className="text-xs text-charcoal/55 italic">{meta.description}</p>
                    </div>

                    {/* Word list - styled like a scholarly index */}
                    <ul className="space-y-1">
                      {words.map((word, wordIndex) => (
                        <li key={word}>
                          <button
                            onClick={() => onWordClick(word)}
                            className="
                              group
                              flex items-center gap-3
                              w-full text-left
                              px-3 py-2
                              rounded-md
                              font-serif
                              hover:bg-cream-dark/60
                              transition-all duration-200
                            "
                            style={{
                              animationDelay: `${
                                rootIndex * 100 + categoryIndex * 80 + wordIndex * 30
                              }ms`,
                            }}
                          >
                            {/* Arrow indicator */}
                            <span
                              className="
                              text-charcoal-light/55
                              group-hover:text-charcoal
                              group-hover:translate-x-1
                              transition-all duration-200
                            "
                            >
                              →
                            </span>

                            {/* Word */}
                            <span
                              className="
                              group-hover:text-charcoal
                              group-hover:underline
                              underline-offset-4
                              decoration-charcoal/30
                              transition-colors duration-200
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
