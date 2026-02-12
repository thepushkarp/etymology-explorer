'use client'

import { useState } from 'react'

interface HistoricalContextProps {
  wikipediaExtract: string
}

export default function HistoricalContext({ wikipediaExtract }: HistoricalContextProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!wikipediaExtract?.trim()) return null

  return (
    <section className="mt-8 pt-8 border-t border-charcoal/10">
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
          <span className="text-2xl font-serif text-charcoal/30 select-none">\u00a7</span>
          <h2 className="font-serif text-xl font-semibold text-charcoal/80 group-hover:text-charcoal">
            Historical Context
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-charcoal/40 font-sans uppercase tracking-wider">
            from Wikipedia
          </span>
          <svg
            className={`w-5 h-5 text-charcoal/40 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
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
          <div
            className="
            bg-charcoal/[0.02] 
            rounded-md 
            p-6
            border-l-4 border-charcoal/10
          "
          >
            <p
              className="
              font-serif 
              text-base 
              leading-relaxed 
              text-charcoal/80
            "
            >
              {wikipediaExtract}
            </p>
          </div>

          <p className="mt-3 text-xs text-charcoal/40 font-sans">
            Source:{' '}
            <a
              href={`https://en.wikipedia.org/wiki/${wikipediaExtract.split(' ')[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-charcoal/60 transition-colors"
            >
              Wikipedia
            </a>
          </p>
        </div>
      )}
    </section>
  )
}
