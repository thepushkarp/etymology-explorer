'use client'

import { useEffect, useMemo, useState } from 'react'
import { EntryView } from '@/components/EntryView'
import { ErrorState } from '@/components/ErrorState'
import { EtymologyCard } from '@/components/EtymologyCard'
import { LanguageTabs } from '@/components/LanguageTabs'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { SourceIcon } from '@/components/SourceIcon'
import { useNgram } from '@/lib/hooks/useNgram'
import { useStreamingEtymology } from '@/lib/hooks/useStreamingEtymology'
import { consumeTraceIntent, scheduleTraceIntent } from '@/lib/traceIntent'
import { toPartialResult, type StreamState } from '@/lib/streamReducer'
import { LANGUAGES, type LanguageCode } from '@/lib/languages'
import type { WordEntry } from '@/lib/types'

interface WordTraceExperienceProps {
  word: string
  language?: LanguageCode
  initialEntry?: WordEntry
  stale?: boolean
}

function announcementFor(progress: StreamState, word: string): string {
  switch (progress.phase) {
    case 'sources':
      return progress.languages.length
        ? `Consulting sources for “${word}”…`
        : 'Finding the languages that have this word…'
    case 'synthesis':
      return 'Tracing ancestry…'
    case 'done':
      return 'Result ready.'
    case 'error':
      return progress.error ? `Search failed. ${progress.error.message}` : 'Search failed.'
    default:
      return ''
  }
}

/**
 * Live tracing experience for an uncached /word/{word} page.
 *
 * COST INVARIANT: the trace auto-starts only when the in-app navigation
 * flag (lib/traceIntent.ts) is present. Direct loads and crawlers — even
 * JS-executing ones — see the "Trace" button, so a human click is required
 * to spend LLM budget.
 */
export function WordTraceExperience({
  word,
  language,
  initialEntry,
  stale = false,
}: WordTraceExperienceProps) {
  const { progress, search } = useStreamingEtymology()
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>()
  const selected =
    (progress.status === 'error' ? language : selectedLanguage) ??
    language ??
    progress.result?.languages[0] ??
    progress.languages[0] ??
    initialEntry?.languages[0] ??
    'en'
  const slice = progress.byLanguage[selected]
  const unavailable = Boolean(
    language &&
    initialEntry &&
    !stale &&
    initialEntry.attemptedLanguages?.includes(language) &&
    !initialEntry.entries[language]
  )
  const started = progress.status !== 'idle'
  // Start the usage-chart request alongside the trace so it is ready when the entry is.
  const ngram = useNgram(started && progress.languages.includes(selected) ? word : null, selected)

  useEffect(() => {
    if (unavailable || (initialEntry && stale)) {
      consumeTraceIntent(word)
      return
    }
    return scheduleTraceIntent(word, language, search)
  }, [word, language, search, unavailable, initialEntry, stale])

  const partial = useMemo(() => {
    const streamed = toPartialResult(word, slice?.sections ?? {}, selected)
    return { ...streamed, ngram: ngram.status === 'ready' ? ngram.data : undefined }
  }, [word, selected, slice?.sections, ngram])

  const tabs = (
    <LanguageTabs
      word={word}
      languages={
        progress.status === 'error' && initialEntry
          ? initialEntry.languages
          : progress.languages.length
            ? progress.languages
            : (initialEntry?.languages ?? [])
      }
      otherLanguages={
        progress.otherLanguages.length
          ? progress.otherLanguages
          : (initialEntry?.otherLanguages ?? [])
      }
      otherScripts={
        progress.status === 'error'
          ? undefined
          : (progress.result?.otherScripts ?? progress.otherScripts ?? initialEntry?.otherScripts)
      }
      language={selected}
      onSelect={started && progress.status !== 'error' ? setSelectedLanguage : undefined}
    />
  )
  const start = () => search(word, language, { refresh: stale })

  return (
    <>
      <SiteHeader showSearch searchLanguage={language} />
      <main className="mx-auto w-full max-w-3xl px-4 pt-14 sm:px-6 sm:pt-20">
        <div aria-live="polite" role="status" className="sr-only">
          {announcementFor(progress, word)}
        </div>

        {progress.status === 'success' && progress.result ? (
          <EntryView
            entry={progress.result}
            language={selected}
            onSelectLanguage={setSelectedLanguage}
            languageTabs={tabs}
            unavailableMessage={slice?.error}
          />
        ) : (
          <EtymologyCard
            result={partial}
            pending={progress.status === 'loading'}
            subheader={
              <>
                {tabs}
                {progress.status === 'idle' ? (
                  unavailable ? (
                    <p role="status" className="mt-8 font-serif italic text-muted">
                      No supported {language && LANGUAGES[language].englishName} entry was found for
                      “{word}”.
                    </p>
                  ) : (
                    <TraceGate onStart={start} stale={stale} />
                  )
                ) : progress.status === 'loading' ? (
                  <>
                    {slice?.error ? (
                      <p role="status" className="mt-8 font-serif italic text-muted">
                        {slice.error}
                      </p>
                    ) : (
                      <TraceStatus
                        progress={{
                          ...progress,
                          phase: slice?.phase ?? progress.phase,
                          sources: [
                            ...progress.sources.filter(
                              (source) => !slice?.sources.some((item) => item.key === source.key)
                            ),
                            ...(slice?.sources ?? []),
                          ],
                        }}
                        resolving={progress.languages.length === 0}
                      />
                    )}
                  </>
                ) : (
                  progress.error && (
                    <ErrorState error={progress.error} language={selected} onRetry={start} />
                  )
                )}
              </>
            }
          />
        )}
      </main>
      <SiteFooter />
    </>
  )
}

function TraceGate({ onStart, stale }: { onStart: () => void; stale: boolean }) {
  return (
    <div className="animate-rise mt-8">
      <p className="font-serif text-lg italic text-muted">
        {stale
          ? 'This entry can be traced again with the latest sources.'
          : 'This word has not been traced in this language yet.'}
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-6 border border-ink px-5 py-2.5 font-serif text-ink transition-colors hover:bg-ink hover:text-paper"
      >
        {stale ? 'Retrace its origins' : 'Trace its origins'}
      </button>
    </div>
  )
}

/** Wall-clock milliseconds since this component mounted, ticking every 100ms while `running`. */
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

function TraceStatus({ progress, resolving }: { progress: StreamState; resolving: boolean }) {
  const elapsed = useElapsed(progress.status === 'loading')
  const message = resolving
    ? 'Finding the languages that have this word…'
    : progress.phase === 'synthesis'
      ? 'Writing the entry…'
      : progress.sharedWaitMs !== null
        ? 'Someone is already tracing this word — joining them…'
        : 'Reading the sources…'

  return (
    <div className="mt-8 text-sm">
      <p className="font-serif italic text-muted">
        {message} <span className="not-italic tabular-nums text-faint">{seconds(elapsed)}</span>
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {progress.sources.map((source) => (
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
                ? seconds(elapsed)
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
