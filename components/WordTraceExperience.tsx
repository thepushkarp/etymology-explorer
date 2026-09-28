'use client'

import { useEffect, useMemo } from 'react'
import { EntryView } from '@/components/EntryView'
import { ErrorState } from '@/components/ErrorState'
import { EtymologyCard } from '@/components/EtymologyCard'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { useNgram } from '@/lib/hooks/useNgram'
import { useStreamingEtymology } from '@/lib/hooks/useStreamingEtymology'
import { consumeTraceIntent } from '@/lib/traceIntent'
import { toPartialResult, type StreamState } from '@/lib/streamReducer'
import type { LanguageCode } from '@/lib/languages'

interface WordTraceExperienceProps {
  word: string
  language?: LanguageCode
}

function announcementFor(progress: StreamState, word: string): string {
  switch (progress.phase) {
    case 'sources':
      return `Consulting sources for “${word}”…`
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
export function WordTraceExperience({ word, language = 'en' }: WordTraceExperienceProps) {
  const { progress, search } = useStreamingEtymology(language)
  const started = progress.status !== 'idle'
  // Start the usage-chart request alongside the trace so it is ready when the entry is.
  const ngram = useNgram(started ? word : null, language)

  useEffect(() => {
    if (consumeTraceIntent(word, language)) search(word)
  }, [word, language, search])

  const partial = useMemo(() => {
    const streamed = toPartialResult(word, progress.sections, language)
    if (language !== 'en') {
      // Beta bodies arrive bilingual and per-history; only the header streams.
      return { ...streamed, ancestryGraph: { branches: [] }, lore: '', roots: [], sources: [] }
    }
    return { ...streamed, ngram: ngram.status === 'ready' ? ngram.data : undefined }
  }, [word, language, progress.sections, ngram])

  return (
    <>
      <SiteHeader searchLanguage={language} />
      <main className="mx-auto w-full max-w-3xl px-4 pt-14 sm:px-6 sm:pt-20">
        <div aria-live="polite" role="status" className="sr-only">
          {announcementFor(progress, word)}
        </div>

        {progress.status === 'success' && progress.result ? (
          <EntryView result={progress.result} />
        ) : (
          <EtymologyCard
            result={partial}
            pending={progress.status === 'loading'}
            contentLocale={language === 'en' ? 'en' : 'local'}
            subheader={
              progress.status === 'idle' ? (
                <TraceGate onStart={() => search(word)} />
              ) : progress.status === 'loading' ? (
                <TraceStatus progress={progress} />
              ) : (
                progress.error && (
                  <ErrorState
                    error={progress.error}
                    language={language}
                    onRetry={() => search(word)}
                  />
                )
              )
            }
          />
        )}
      </main>
      <SiteFooter />
    </>
  )
}

function TraceGate({ onStart }: { onStart: () => void }) {
  return (
    <div className="animate-rise mt-8">
      <p className="font-serif text-lg italic text-muted">This word has not been traced yet.</p>
      <button
        type="button"
        onClick={onStart}
        className="mt-6 border border-ink px-5 py-2.5 font-serif text-ink transition-colors hover:bg-ink hover:text-paper"
      >
        Trace its origins
      </button>
    </div>
  )
}

function TraceStatus({ progress }: { progress: StreamState }) {
  const message =
    progress.phase === 'synthesis'
      ? 'Writing the entry…'
      : progress.sharedWaitMs !== null
        ? 'Someone is already tracing this word — joining them…'
        : 'Reading the sources…'

  return (
    <div className="mt-8 text-sm">
      <p className="font-serif italic text-muted">{message}</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {progress.sources.map((source) => (
          <span
            key={source.key}
            className={`transition-colors duration-500 ${
              source.status === 'complete'
                ? 'text-ink'
                : source.status === 'failed'
                  ? 'text-faint line-through'
                  : 'animate-pulse text-faint'
            }`}
          >
            {source.label}
          </span>
        ))}
      </p>
    </div>
  )
}
