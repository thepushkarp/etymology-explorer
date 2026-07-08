'use client'

import type { SourceProgress, SourceStatus } from '@/lib/streamReducer'

interface ResearchProgressProps {
  sources: SourceProgress[]
  parsingComplete: boolean
  sharedWaitMs: number | null
  query?: string
}

export default function ResearchProgress({
  sources,
  parsingComplete,
  sharedWaitMs,
  query,
}: ResearchProgressProps) {
  return (
    <section className="editorial-shell animate-fadeIn p-6 sm:p-8 lg:p-10">
      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
            researching
          </p>
          <h2 className="mt-3 font-serif text-4xl tracking-[-0.05em] text-charcoal sm:text-5xl lg:text-6xl">
            {query || 'your word'}
          </h2>
          <p className="mt-4 max-w-xl font-serif text-lg italic leading-relaxed text-charcoal-light">
            Consulting the archive, cross-checking the sources, and assembling the line of descent.
          </p>

          <div className="mt-8 space-y-4">
            {parsingComplete && (
              <div className="inline-flex items-center gap-2 text-sm text-charcoal/60">
                <StatusMark complete />
                <span className="font-serif italic">Parsing etymology chains</span>
              </div>
            )}

            {sharedWaitMs !== null && (
              <div className="animate-fadeIn">
                <div className="inline-flex items-center gap-2 text-sm text-charcoal/60">
                  <StatusMark />
                  <span className="font-serif italic">
                    Another lookup for this word is already running — sharing its result
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="editorial-card p-5 sm:p-6">
          <div className="border-b border-border-soft pb-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
              sources
            </p>
          </div>

          <div
            className={`
              mt-5 overflow-hidden transition-all duration-500 ease-out
              ${parsingComplete ? 'opacity-85' : 'opacity-100'}
            `}
          >
            <div className="space-y-3">
              {sources.map((source, index) => (
                <div
                  key={source.key}
                  className={`
                    animate-fadeIn rounded-[0.95rem] border px-4 py-3
                    ${
                      source.status === 'complete'
                        ? 'border-border-strong bg-surface'
                        : source.status === 'failed'
                          ? 'border-red-500/25 bg-red-500/[0.04]'
                          : 'border-border-soft bg-paper-deep/45'
                    }
                  `}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <SourceIcon status={source.status} />
                    <span
                      className={
                        source.status === 'failed'
                          ? 'font-medium text-red-700/85 dark:text-red-300/85'
                          : 'font-medium text-charcoal/82'
                      }
                    >
                      {source.label}
                    </span>
                    <span className="ml-auto text-xs uppercase tracking-[0.16em] text-charcoal-light/56">
                      {source.status === 'complete'
                        ? source.timing
                          ? `${(source.timing / 1000).toFixed(1)}s`
                          : 'done'
                        : source.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}

function StatusMark({ complete = false }: { complete?: boolean }) {
  if (complete) {
    return (
      <svg
        className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    )
  }

  return (
    <svg
      className="h-4 w-4 animate-pulse text-[var(--accent-oxblood)]"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <circle cx="4" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="20" cy="12" r="2" />
    </svg>
  )
}

function SourceIcon({ status }: { status: SourceStatus }) {
  if (status === 'complete') {
    return <StatusMark complete />
  }

  if (status === 'failed') {
    return (
      <svg
        className="h-4 w-4 text-red-600 dark:text-red-400"
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
    )
  }

  return (
    <svg className="h-4 w-4 animate-spin text-charcoal/55" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
