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
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          group relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm
          transition-all duration-300 ease-out
          ${
            isExpanded
              ? 'border border-charcoal bg-charcoal text-cream shadow-lg'
              : 'border border-border-soft bg-surface text-charcoal hover:-translate-y-px hover:border-border-strong hover:shadow-sm'
          }
        `}
      >
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

      {isExpanded && (
        <div
          className="
            mt-4 rounded-[1.4rem] border border-border-soft bg-cream-dark/24 p-4
            animate-fadeIn
          "
        >
          <p className="mb-3 font-serif text-sm italic text-charcoal-light">
            <span className="not-italic font-medium text-charcoal">Meaning:</span> {root.meaning}
          </p>

          {root.ancestorRoots && root.ancestorRoots.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-charcoal">
                Ancestor Roots
              </p>
              <div className="flex flex-wrap gap-2">
                {root.ancestorRoots.map((ancestorRoot, index) => (
                  <span
                    key={ancestorRoot}
                    className="
                      rounded-full border border-charcoal/14 bg-surface px-3 py-1.5 text-sm
                      text-charcoal-light
                    "
                    style={{
                      animationDelay: `${index * 50}ms`,
                    }}
                  >
                    {ancestorRoot}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-charcoal">
              Related Words
            </p>
            <div className="flex flex-wrap gap-2">
              {root.relatedWords.map((word, index) => (
                <button
                  key={word}
                  onClick={() => onWordClick(word)}
                  className="
                    group/word relative rounded-full border border-border-soft bg-surface px-3 py-1.5
                    text-sm font-serif transition-all duration-200 hover:-translate-y-px hover:bg-charcoal
                    hover:text-cream
                  "
                  style={{
                    animationDelay: `${index * 50}ms`,
                  }}
                >
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

          {root.descendantWords && root.descendantWords.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-charcoal">
                Descendant Words
              </p>
              <div className="flex flex-wrap gap-2">
                {root.descendantWords.map((descendantWord, index) => (
                  <button
                    key={descendantWord}
                    onClick={() => onWordClick(descendantWord)}
                    className="
                      group/desc relative rounded-full border border-border-soft bg-surface px-3 py-1.5
                      text-sm font-serif text-charcoal-light transition-all duration-200 hover:-translate-y-px
                      hover:bg-charcoal hover:text-cream
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
                      bg-charcoal/30 group-hover/desc:bg-cream/50
                      transition-colors duration-200
                    "
                    />
                    <span className="pl-2">{descendantWord}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
