'use client'

import { useEffect, useState } from 'react'
import { SourceIcon } from '@/components/SourceIcon'
import type { StreamState } from '@/lib/streamReducer'
import type { LanguageCode } from '@/lib/languages'

function useElapsed(running: boolean): number {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [running])
  return now - start
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

export function TraceStatus({
  progress,
  language,
}: {
  progress: StreamState
  language: LanguageCode
}) {
  const slice = progress.byLanguage[language]
  const sources = [
    ...progress.sources.filter((source) => !slice?.sources.some((item) => item.key === source.key)),
    ...(slice?.sources ?? []),
  ]
  const resolving = progress.languages.length === 0
  const elapsed = useElapsed(progress.status === 'loading')
  const message =
    slice?.error ??
    (resolving
      ? 'Finding the languages that have this word…'
      : (slice?.phase ?? progress.phase) === 'synthesis'
        ? 'Writing the entry…'
        : progress.sharedWaitMs !== null
          ? 'Someone is already tracing this word — joining them…'
          : 'Reading the sources…')

  return (
    <div className="mt-8 text-sm">
      <p className="font-serif italic text-muted" role="status">
        {message}{' '}
        <span aria-hidden="true" className="not-italic tabular-nums text-faint">
          {seconds(elapsed)}
        </span>
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {sources.map((source) => (
          <li
            key={source.key}
            className={`transition-colors duration-500 ${
              source.status === 'complete' ? 'text-ink' : 'text-faint'
            }`}
          >
            <span className="inline-flex items-center gap-1.5 align-middle">
              <SourceIcon source={source.key} />
              {source.label}
            </span>{' '}
            <span className="tabular-nums text-muted" title={source.reason}>
              {source.status === 'pending'
                ? 'reading…'
                : source.status !== 'complete'
                  ? {
                      failed: 'unavailable',
                      not_found: 'no entry',
                      no_evidence: 'no evidence',
                      blocked: 'blocked',
                      unavailable: 'unavailable',
                      budget_skipped: 'limit reached',
                    }[source.status]
                  : source.timing !== undefined
                    ? seconds(source.timing)
                    : 'done'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
