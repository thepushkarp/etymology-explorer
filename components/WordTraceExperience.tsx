'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { ErrorState } from '@/components/ErrorState'
import { EtymologyCard } from '@/components/EtymologyCard'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import ResearchProgress from '@/components/ResearchProgress'
import { ShareMenu } from '@/components/ShareMenu'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { SourceSummaryLine } from '@/components/SourceSummaryLine'
import { StreamingEtymologyCard } from '@/components/StreamingEtymologyCard'
import { TraceHeader } from '@/components/TraceHeader'
import { useNgram } from '@/lib/hooks/useNgram'
import { usePronunciation } from '@/lib/hooks/usePronunciation'
import { useStreamingEtymology } from '@/lib/hooks/useStreamingEtymology'
import { useWordNavigation } from '@/lib/hooks/useWordNavigation'
import { consumeTraceIntent } from '@/lib/traceIntent'
import type { StreamState } from '@/lib/streamReducer'

interface WordTraceExperienceProps {
  word: string
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
 * Live tracing experience for an uncharted /word/{word} page.
 *
 * COST INVARIANT: the trace auto-starts only when the in-app navigation
 * flag (lib/traceIntent.ts) is present. Direct loads and crawlers — even
 * JS-executing ones — see the server-rendered "Trace it live" gate and a
 * human click is required to spend LLM budget.
 */
export function WordTraceExperience({ word }: WordTraceExperienceProps) {
  const { progress, search } = useStreamingEtymology()
  const startedRef = useRef(false)
  const { navigateToWord, historyBack, historyForward } = useWordNavigation(word)
  // Derived, not stored: the trace has started once the stream reducer left
  // idle. The ngram fetch keys off the same signal (word known at start).
  const hasStarted = progress.status !== 'idle'
  const ngram = useNgram(hasStarted ? word : null)
  const { play: playPronunciation } = usePronunciation(word)

  const startTrace = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    search(word)
  }, [search, word])

  useEffect(() => {
    if (consumeTraceIntent(word)) {
      startTrace()
    }
  }, [word, startTrace])

  const resultWithNgram = useMemo(() => {
    if (!progress.result) return null
    return {
      ...progress.result,
      ngram: ngram && ngram.word === progress.result.word ? ngram : undefined,
    }
  }, [progress.result, ngram])

  const headerActions = useMemo(
    () => (resultWithNgram ? <ShareMenu result={resultWithNgram} /> : undefined),
    [resultWithNgram]
  )

  const handlePlayPronunciation = useCallback(() => {
    if (progress.status === 'success') {
      void playPronunciation()
    }
  }, [progress.status, playPronunciation])

  const isLoading = hasStarted && progress.status === 'loading'
  const showResearchProgress = isLoading && progress.phase !== 'synthesis'
  const showStreamingCard = isLoading && progress.phase === 'synthesis'

  return (
    <div className="min-h-screen bg-cream text-charcoal">
      <SiteHeader compact />
      <main className="mx-auto max-w-[1180px] px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pt-14">
        <Link
          href="/"
          className="editorial-link inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-charcoal-light/72 transition-colors hover:text-charcoal"
        >
          <span aria-hidden="true">&larr;</span>
          <span>Back to explorer</span>
        </Link>

        <div aria-live="polite" role="status" className="sr-only">
          {announcementFor(progress, word)}
        </div>

        <div className="mt-8">
          {!hasStarted && <TraceGate word={word} onStart={startTrace} />}

          {isLoading && (
            <article aria-busy="true" className="editorial-shell animate-fadeIn p-6 sm:p-8 md:p-12">
              <TraceHeader
                word={word}
                sections={progress.sections}
                summary={
                  showStreamingCard ? <SourceSummaryLine sources={progress.sources} /> : null
                }
              />

              {showResearchProgress && (
                <ResearchProgress
                  sources={progress.sources}
                  parsingComplete={progress.parsingComplete}
                  sharedWaitMs={progress.sharedWaitMs}
                />
              )}

              {showStreamingCard && (
                <StreamingEtymologyCard
                  word={word}
                  sections={progress.sections}
                  ngram={ngram}
                  onWordClick={navigateToWord}
                />
              )}
            </article>
          )}

          {progress.status === 'error' && progress.error && (
            <ErrorState
              type={progress.error.type}
              message={progress.error.message}
              suggestions={progress.error.suggestions}
              onSuggestionClick={navigateToWord}
            />
          )}

          {progress.status === 'success' && resultWithNgram && (
            <EtymologyCard
              result={resultWithNgram}
              onWordClick={navigateToWord}
              headerActions={headerActions}
            />
          )}
        </div>
      </main>

      <KeyboardShortcuts
        onHistoryBack={historyBack}
        onHistoryForward={historyForward}
        onPlayPronunciation={handlePlayPronunciation}
      />

      <SiteFooter />
    </div>
  )
}

function TraceGate({ word, onStart }: { word: string; onStart: () => void }) {
  return (
    <>
      <header className="max-w-3xl pb-8">
        <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/66">
          uncharted entry
        </p>
        <h1 className="mt-3 font-serif text-5xl tracking-[-0.05em] text-charcoal sm:text-6xl lg:text-[4.8rem]">
          {word}
        </h1>
        <p className="mt-5 max-w-2xl font-serif text-xl italic leading-relaxed text-charcoal-light sm:text-[1.7rem]">
          This word has not been traced in the archive yet. Its older forms and borrowed meanings
          are still waiting to be followed back.
        </p>
        <div className="editorial-double-rule mt-8" />
      </header>

      <section className="mx-auto max-w-3xl pt-10">
        <div className="editorial-card flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-serif text-xl italic text-charcoal-light">no entry on file</p>
            <p className="mt-2 font-serif text-3xl tracking-[-0.03em] text-charcoal">
              Trace it live and watch the roots surface.
            </p>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="editorial-chip self-start font-serif italic sm:self-center"
          >
            Trace &ldquo;{word}&rdquo; live &rarr;
          </button>
        </div>
      </section>
    </>
  )
}
