'use client'

import { useMemo } from 'react'
import { StreamEvent } from '@/lib/types'

interface ResearchProgressProps {
  events: StreamEvent[]
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

export default function ResearchProgress({ events }: ResearchProgressProps) {
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
  const visibleSynthesisLines = synthesisLines.slice(-4)
  const paddedSynthesisLines = Array.from({ length: 4 }, (_, index) => {
    const offset = 4 - visibleSynthesisLines.length
    return visibleSynthesisLines[index - offset] ?? ''
  })

  return (
    <div className="space-y-6 py-4">
      {/* Source cards */}
      <div
        className={`
          overflow-hidden
          transition-all duration-500 ease-out
          ${collapseSourceChips ? 'max-h-0 opacity-0 -translate-y-1' : 'max-h-64 opacity-100'}
        `}
      >
        <div className="flex flex-wrap gap-3 justify-center">
          {sourceOrder.map((key, index) => {
            const source = sources[key]
            return (
              <div
                key={key}
                className={`
              inline-flex items-center gap-2 px-4 py-2
              rounded-full border
              text-sm font-sans
              transition-all duration-300
              animate-fadeIn
              ${
                source.status === 'complete'
                  ? 'border-charcoal/20 bg-charcoal/[0.03]'
                  : source.status === 'failed'
                    ? 'border-red-500/30 bg-red-500/[0.05]'
                    : 'border-charcoal/10 bg-transparent'
              }
            `}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {source.status === 'pending' && (
                  <svg
                    className="w-4 h-4 animate-spin text-charcoal/55"
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
                    className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
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
                    className="w-4 h-4 text-red-600 dark:text-red-400"
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
                  ? 'text-charcoal/80'
                  : source.status === 'failed'
                    ? 'text-red-600/80 dark:text-red-400/80'
                    : 'text-charcoal/50'
              }
            `}
                >
                  {source.name}
                </span>

                {source.status === 'complete' && source.timing && (
                  <span className="text-xs text-charcoal/55 font-mono">
                    {(source.timing / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Phase indicators */}
      <div className="space-y-3 text-center">
        {parsingComplete && (
          <div className="animate-fadeIn">
            <div className="inline-flex items-center gap-2 text-sm text-charcoal/60 font-serif italic">
              <svg
                className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
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
            <div className="inline-flex items-center gap-2 text-sm text-charcoal/60 font-serif italic">
              {!enrichmentDone && (
                <svg
                  className="w-4 h-4 animate-pulse text-violet-600 dark:text-violet-400"
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
                  className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
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
              Synthesizing...
            </div>

            {visibleSynthesisLines.length > 0 && (
              <div className="mx-auto mt-4 max-w-md overflow-hidden rounded-[1.25rem] border border-border-soft bg-surface/72 px-4 py-3 shadow-[0_16px_36px_-28px_var(--shadow-color)]">
                <div
                  key={synthesisLines.length}
                  className="flex h-[6.8rem] flex-col justify-end gap-2 animate-stream-roll"
                >
                  {paddedSynthesisLines.map((line, index) => (
                    <div
                      key={`${index}-${line}`}
                      className={`
                        min-h-[1.15rem] pb-1 text-center font-mono text-[11px] leading-relaxed
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
          <div className="animate-fadeIn">
            <div className="inline-flex items-center gap-2 text-sm text-charcoal/60 font-serif italic">
              <svg
                className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
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
