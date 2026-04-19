'use client'

import { useMemo } from 'react'
import { StreamEvent } from '@/lib/types'

interface ResearchProgressProps {
  events: StreamEvent[]
  query?: string
}

type SourceStatus = 'pending' | 'complete' | 'failed'

interface SourceState {
  name: string
  status: SourceStatus
  timing?: number
}

const SOURCE_LABELS: Record<string, string> = {
  etymonline: 'Etymonline',
  wiktionary: 'Wiktionary',
  freedictionary: 'Free Dictionary',
  wikipedia: 'Wikipedia',
  urbandictionary: 'Urban Dictionary',
  incelswiki: 'Incels Wiki',
}

const DEFAULT_SOURCE_ORDER = [
  'etymonline',
  'wiktionary',
  'freedictionary',
  'wikipedia',
  'urbandictionary',
  'incelswiki',
]

function normalizeSourceKey(source: string): string {
  return source.toLowerCase().replace(/\s+/g, '')
}

function buildSynthesisLines(tokens: string, maxLineLength = 42): string[] {
  const normalized = tokens.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const words = normalized.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word
    if (currentLine && nextLine.length > maxLineLength) {
      lines.push(currentLine)
      currentLine = word
      continue
    }

    currentLine = nextLine
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

export default function ResearchProgress({ events, query }: ResearchProgressProps) {
  // Build source states from events
  const sources: Record<string, SourceState> = {}
  const sourceOrder: string[] = []

  let parsingComplete = false
  let synthesisStarted = false
  let synthesisTokens = ''
  let enrichmentDone = false

  const ensureSource = (source: string): string => {
    const sourceKey = normalizeSourceKey(source)
    if (!sources[sourceKey]) {
      sources[sourceKey] = {
        name: SOURCE_LABELS[sourceKey] ?? source,
        status: 'pending',
      }
      sourceOrder.push(sourceKey)
    }
    return sourceKey
  }

  // Process events to update states
  events.forEach((event) => {
    if (event.type === 'source_started') {
      ensureSource(event.source)
    } else if (event.type === 'source_complete') {
      const sourceKey = ensureSource(event.source)
      sources[sourceKey].status = 'complete'
      sources[sourceKey].timing = event.timing
    } else if (event.type === 'source_failed') {
      const sourceKey = ensureSource(event.source)
      sources[sourceKey].status = 'failed'
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

  // Fallback during the very first render before streaming events arrive.
  if (sourceOrder.length === 0) {
    for (const sourceKey of DEFAULT_SOURCE_ORDER) {
      sources[sourceKey] = {
        name: SOURCE_LABELS[sourceKey] ?? sourceKey,
        status: 'pending',
      }
      sourceOrder.push(sourceKey)
    }
  }

  const collapseSourceChips = parsingComplete
  const synthesisLines = useMemo(() => buildSynthesisLines(synthesisTokens), [synthesisTokens])
  const hasSynthesisTokens = synthesisLines.length > 0
  const visibleSynthesisLines = synthesisLines.slice(-4)
  const paddedSynthesisLines = Array.from({ length: 4 }, (_, index) => {
    const offset = 4 - visibleSynthesisLines.length
    return visibleSynthesisLines[index - offset] ?? ''
  })
  const synthesisPhaseLabel = enrichmentDone
    ? 'Finalizing grounded result'
    : hasSynthesisTokens
      ? 'Streaming synthesis'
      : 'Reasoning over sources'
  const synthesisPhaseDetail = enrichmentDone
    ? 'Aligning the generated explanation with evidence...'
    : hasSynthesisTokens
      ? 'Unfolding the story...'
      : 'Putting the explanation together...'

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

            {synthesisStarted && (
              <div className="animate-fadeIn">
                <div className="inline-flex items-center gap-2 text-sm text-charcoal/60">
                  {enrichmentDone ? <StatusMark complete /> : <StatusMark />}
                  <span className="font-serif italic">{synthesisPhaseLabel}</span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-charcoal-light">
                  {synthesisPhaseDetail}
                </p>

                {visibleSynthesisLines.length > 0 && (
                  <div className="editorial-inset mt-5 w-full max-w-none overflow-hidden px-4 py-4">
                    <div
                      key={synthesisLines.length}
                      className="flex h-[6.8rem] flex-col justify-center gap-2 animate-stream-roll"
                    >
                      {paddedSynthesisLines.map((line, index) => (
                        <div
                          key={`${index}-${line}`}
                          className={`
                            min-h-[1.15rem] text-center font-mono text-[11px] leading-relaxed
                            text-charcoal/72 transition-opacity duration-200
                            ${line ? '' : 'opacity-0'}
                          `}
                          style={{ opacity: line ? [0.28, 0.45, 0.68, 1][index] : 0 }}
                        >
                          {line || '\u00a0'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {enrichmentDone && (
              <div className="inline-flex items-center gap-2 text-sm text-charcoal/60">
                <StatusMark complete />
                <span className="font-serif italic">Matching evidence to the final reading</span>
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
              ${collapseSourceChips ? 'opacity-85' : 'opacity-100'}
            `}
          >
            <div className="space-y-3">
              {sourceOrder.map((key, index) => {
                const source = sources[key]
                return (
                  <div
                    key={key}
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
                        {source.name}
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
                )
              })}
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
