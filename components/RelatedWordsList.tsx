'use client'

import { Root } from '@/lib/types'

interface RelatedWordsListProps {
  roots: Root[]
  onWordClick: (word: string) => void
}

export function RelatedWordsList({ roots, onWordClick }: RelatedWordsListProps) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      {roots.map((root, rootIndex) => (
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
            From <span className="font-semibold text-charcoal italic">&apos;{root.root}&apos;</span>
            <span className="text-charcoal/40 mx-2">·</span>
            <span className="text-charcoal/60">{root.meaning}</span>
          </h3>

          {/* Word list - styled like a scholarly index */}
          <ul className="space-y-1">
            {root.relatedWords.map((word, wordIndex) => (
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
                    animationDelay: `${rootIndex * 100 + wordIndex * 30}ms`,
                  }}
                >
                  {/* Arrow indicator */}
                  <span
                    className="
                    text-charcoal-light/40
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
      ))}
    </div>
  )
}
