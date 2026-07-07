'use client'

import { useState } from 'react'
import type { SourceReference } from '@/lib/types'

interface HistoricalContextProps {
  wikipediaExtract: string
  sourceUrl?: string
}

/** Find the Wikipedia page URL among a result's source references, if any. */
export function wikipediaSourceUrl(sources: SourceReference[]): string | undefined {
  return sources.find((source) => source.name === 'wikipedia' && source.url)?.url
}

export default function HistoricalContext({ wikipediaExtract, sourceUrl }: HistoricalContextProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!wikipediaExtract?.trim()) return null

  return (
    <section id="entry-context" className="mt-12 border-t border-border-soft pt-10">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="
          w-full flex items-center justify-between gap-4
          group cursor-pointer
          transition-colors duration-200
          hover:text-charcoal
        "
        aria-expanded={isExpanded}
        aria-controls="historical-context-content"
      >
        <div className="flex items-center gap-3">
          <span className="select-none font-serif text-2xl text-charcoal/45">§</span>
          <h2 className="font-serif text-xl font-semibold text-charcoal/80 group-hover:text-charcoal">
            Historical Context
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-charcoal/55 font-sans uppercase tracking-wider">
            from Wikipedia
          </span>
          <svg
            className={`w-5 h-5 text-charcoal/55 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div id="historical-context-content" className="mt-6 animate-fadeIn">
          <div className="editorial-card p-6">
            <p className="editorial-kicker">meanwhile, in the wider world</p>
            <p className="mt-4 font-serif text-base leading-relaxed text-charcoal/80">
              {wikipediaExtract}
            </p>
          </div>

          {sourceUrl && (
            <p className="mt-3 text-xs text-charcoal/55 font-sans">
              Source:{' '}
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="editorial-link transition-colors hover:text-charcoal/60"
              >
                Wikipedia
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
