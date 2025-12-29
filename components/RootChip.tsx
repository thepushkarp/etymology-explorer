'use client'

import { useState } from 'react'
import { Root } from '@/lib/types'

interface RootChipProps {
  root: Root
  onWordClick: (word: string) => void
}

export function RootChip({ root, onWordClick }: RootChipProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="inline-block">
      {/* Main chip button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          group relative
          inline-flex items-center gap-2
          px-4 py-2 rounded-full
          font-serif text-sm
          transition-all duration-300 ease-out
          ${
            isExpanded
              ? 'bg-charcoal text-cream shadow-lg'
              : 'bg-white border border-charcoal/20 text-charcoal hover:border-charcoal/40 hover:shadow-sm'
          }
        `}
      >
        {/* Root name with decorative dot */}
        <span className="font-semibold tracking-wide">{root.root}</span>
        <span
          className={`
            w-1 h-1 rounded-full
            transition-colors duration-300
            ${isExpanded ? 'bg-cream/40' : 'bg-charcoal/30'}
          `}
        />
        <span
          className={`
          text-xs italic
          ${isExpanded ? 'text-cream/70' : 'text-charcoal-light'}
        `}
        >
          {root.origin}
        </span>

        {/* Chevron indicator */}
        <svg
          className={`
            w-4 h-4 ml-1
            transition-transform duration-300 ease-out
            ${isExpanded ? 'rotate-180' : ''}
            ${isExpanded ? 'text-cream/60' : 'text-charcoal/40'}
          `}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content - styled like a margin note in old books */}
      {isExpanded && (
        <div
          className="
            mt-3 ml-4 pl-4
            border-l-2 border-charcoal/20
            animate-fadeIn
          "
        >
          {/* Meaning section */}
          <p className="text-sm text-charcoal-light mb-3 font-serif italic">
            <span className="not-italic font-medium text-charcoal">Meaning:</span> {root.meaning}
          </p>

          {/* Related words - styled like a scholarly index */}
          <div className="flex flex-wrap gap-2">
            {root.relatedWords.map((word, index) => (
              <button
                key={word}
                onClick={() => onWordClick(word)}
                className="
                  group/word
                  relative
                  px-3 py-1.5
                  text-sm font-serif
                  bg-cream-dark/60
                  rounded
                  hover:bg-charcoal hover:text-cream
                  transition-all duration-200
                "
                style={{
                  animationDelay: `${index * 50}ms`,
                }}
              >
                {/* Decorative bullet */}
                <span
                  className="
                  absolute left-1 top-1/2 -translate-y-1/2
                  w-1 h-1 rounded-full
                  bg-charcoal/30 group-hover/word:bg-cream/50
                  transition-colors duration-200
                "
                />
                <span className="pl-2">{word}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
