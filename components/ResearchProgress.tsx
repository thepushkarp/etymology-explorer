'use client'

import { StreamEvent } from '@/lib/types'

interface ResearchProgressProps {
  events: StreamEvent[]
  isStreaming: boolean
}

type SourceStatus = 'pending' | 'complete' | 'failed'

interface SourceState {
  name: string
  status: SourceStatus
  timing?: number
}

export default function ResearchProgress({ events, isStreaming }: ResearchProgressProps) {
  // Build source states from events
  const sources: Record<string, SourceState> = {
    etymonline: { name: 'Etymonline', status: 'pending' },
    wiktionary: { name: 'Wiktionary', status: 'pending' },
    freeDictionary: { name: 'Free Dictionary', status: 'pending' },
    wikipedia: { name: 'Wikipedia', status: 'pending' },
  }

  let parsingComplete = false
  let synthesisStarted = false
  let synthesisTokens = ''
  let enrichmentDone = false

  // Process events to update states
  events.forEach((event) => {
    if (event.type === 'source_complete') {
      const sourceKey = event.source.toLowerCase().replace(/\s+/g, '')
      if (sources[sourceKey]) {
        sources[sourceKey].status = 'complete'
        sources[sourceKey].timing = event.timing
      }
    } else if (event.type === 'source_failed') {
      const sourceKey = event.source.toLowerCase().replace(/\s+/g, '')
      if (sources[sourceKey]) {
        sources[sourceKey].status = 'failed'
      }
    } else if (event.type === 'parsing_complete') {
      parsingComplete = true
    } else if (event.type === 'synthesis_started') {
      synthesisStarted = true
    } else if (event.type === 'synthesis_token') {
      synthesisTokens += event.token
    } else if (event.type === 'enrichment_done') {
      enrichmentDone = true
    }
  })

  return (
    <div className="space-y-6 py-4">
      {/* Source cards */}
      <div className="flex flex-wrap gap-3 justify-center">
        {Object.entries(sources).map(([key, source], index) => (
          <div
            key={key}
            className="
              inline-flex items-center gap-2 px-4 py-2
              rounded-full border
              text-sm font-sans
              transition-all duration-300
              animate-fadeIn
            "
            style={{
              animationDelay: `${index * 50}ms`,
              borderColor:
                source.status === 'complete'
                  ? 'rgba(44, 44, 44, 0.2)'
                  : source.status === 'failed'
                    ? 'rgba(220, 38, 38, 0.3)'
                    : 'rgba(44, 44, 44, 0.1)',
              backgroundColor:
                source.status === 'complete'
                  ? 'rgba(44, 44, 44, 0.03)'
                  : source.status === 'failed'
                    ? 'rgba(220, 38, 38, 0.05)'
                    : 'transparent',
            }}
          >
            {source.status === 'pending' && (
              <svg
                className="w-4 h-4 animate-spin text-charcoal/40"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {source.status === 'complete' && (
              <svg
                className="w-4 h-4 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {source.status === 'failed' && (
              <svg
                className="w-4 h-4 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}

            <span
              className={`
              font-medium
              ${
                source.status === 'complete'
                  ? 'text-charcoal/80 dark:text-cream/90'
                  : source.status === 'failed'
                    ? 'text-red-600/80'
                    : 'text-charcoal/50 dark:text-cream/60'
              }
            `}
            >
              {source.name}
            </span>

            {source.status === 'complete' && source.timing && (
              <span className="text-xs text-charcoal/40 dark:text-cream/60 font-mono">
                {(source.timing / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Phase indicators */}
      <div className="space-y-3 text-center">
        {parsingComplete && (
          <div className="animate-fadeIn">
            <div className="inline-flex items-center gap-2 text-sm text-charcoal/60 dark:text-cream/75 font-serif italic">
              <svg
                className="w-4 h-4 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Parsing etymology chains
            </div>
          </div>
        )}

        {synthesisStarted && (
          <div className="animate-fadeIn">
            <div className="inline-flex items-center gap-2 text-sm text-charcoal/60 dark:text-cream/75 font-serif italic">
              {!enrichmentDone && (
                <svg
                  className="w-4 h-4 animate-pulse text-violet-600"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <circle cx="4" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="20" cy="12" r="2" />
                </svg>
              )}
              {enrichmentDone && (
                <svg
                  className="w-4 h-4 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              Synthesizing with Claude
            </div>

            {synthesisTokens && synthesisTokens.length > 0 && (
              <div className="mt-2 text-xs text-charcoal/40 dark:text-cream/60 font-mono max-w-md mx-auto line-clamp-2">
                {synthesisTokens.slice(-100)}...
              </div>
            )}
          </div>
        )}

        {enrichmentDone && (
          <div className="animate-fadeIn">
            <div className="inline-flex items-center gap-2 text-sm text-charcoal/60 dark:text-cream/75 font-serif italic">
              <svg
                className="w-4 h-4 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Matching evidence
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
