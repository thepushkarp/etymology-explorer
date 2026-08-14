'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ErrorState } from '@/components/ErrorState'
import { EtymologyCard } from '@/components/EtymologyCard'
import { JapaneseEntryCard } from '@/components/japanese/JapaneseEntryCard'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import ResearchProgress from '@/components/ResearchProgress'
import { ResultEditionSwitch } from '@/components/ResultEditionSwitch'
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
import {
  BETA_SYMBOL,
  isBetaLanguage,
  type BetaLanguageCode,
  type LanguageCode,
} from '@/lib/languages'
import { localizeHistoryChoices, localizeResult, type ResultLocale } from '@/lib/resultLocalization'
import type { LexemeCandidate } from '@/lib/types'

interface WordTraceExperienceProps {
  word: string
  language?: LanguageCode
  entryId?: string
  japaneseCandidate?: LexemeCandidate
  searchedQuery?: string
  matchExplanation?: string
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
export function WordTraceExperience({
  word,
  language = 'en',
  entryId,
  japaneseCandidate,
  searchedQuery,
  matchExplanation,
}: WordTraceExperienceProps) {
  const { progress, search } = useStreamingEtymology(language)
  const [contentLocale, setContentLocale] = useState<ResultLocale>(
    language === 'en' ? 'en' : 'local'
  )
  const [activeHistoryId, setActiveHistoryId] = useState<string | undefined>()
  const startedRef = useRef(false)
  const { navigateToWord, historyBack, historyForward } = useWordNavigation(word, language, entryId)
  // Derived, not stored: the trace has started once the stream reducer left
  // idle. The ngram fetch keys off the same signal (word known at start).
  const hasStarted = progress.status !== 'idle'
  const ngramState = useNgram(hasStarted && language !== 'ja' ? word : null, language)
  const ngram = ngramState.status === 'ready' ? ngramState.data : null
  const pronunciationWord = progress.result?.word ?? word
  const pronunciationEntryId =
    progress.result?.language === 'ja' ? progress.result.entryId : entryId
  const { play: playPronunciation } = usePronunciation(
    pronunciationWord,
    language,
    pronunciationEntryId
  )
  const selectedHistoryId =
    activeHistoryId ??
    (progress.result && 'primaryHistoryId' in progress.result
      ? progress.result.primaryHistoryId
      : undefined)

  const startTrace = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    search(word, entryId)
  }, [search, word, entryId])

  useEffect(() => {
    if (consumeTraceIntent(word, language, entryId, searchedQuery)) {
      startTrace()
    }
  }, [word, language, entryId, searchedQuery, startTrace])

  const resultWithNgram = useMemo(() => {
    if (!progress.result) return null
    const enriched = {
      ...progress.result,
      ngram: ngram && ngram.word === progress.result.word ? ngram : undefined,
    }
    return localizeResult(enriched, contentLocale, selectedHistoryId)
  }, [progress.result, ngram, contentLocale, selectedHistoryId])
  const historyChoices = useMemo(
    () => (progress.result ? localizeHistoryChoices(progress.result, contentLocale) : []),
    [progress.result, contentLocale]
  )

  const headerActions = useMemo(
    () =>
      resultWithNgram ? (
        <div className="flex items-center gap-2">
          {isBetaLanguage(language) && (
            <ResultEditionSwitch
              language={language as BetaLanguageCode}
              locale={contentLocale}
              onChange={setContentLocale}
            />
          )}
          <ShareMenu result={resultWithNgram} />
        </div>
      ) : undefined,
    [resultWithNgram, language, contentLocale]
  )

  const handlePlayPronunciation = useCallback(() => {
    if (progress.status === 'success') {
      void playPronunciation()
    }
  }, [progress.status, playPronunciation])

  const isLoading = hasStarted && progress.status === 'loading'
  const showResearchProgress = isLoading && progress.phase !== 'synthesis'
  const showStreamingCard = isLoading && progress.phase === 'synthesis' && language === 'en'

  return (
    <div className="min-h-screen bg-cream text-charcoal">
      <SiteHeader compact />
      <main className="mx-auto max-w-[1040px] px-3 pb-14 pt-8 sm:px-6 sm:pt-10 lg:px-8 lg:pt-12">
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

        <div className="mt-6 sm:mt-8">
          {!hasStarted && (
            <TraceGate
              word={word}
              language={language}
              candidate={japaneseCandidate}
              searchedQuery={searchedQuery}
              matchExplanation={matchExplanation}
              onStart={startTrace}
            />
          )}

          {isLoading && (
            <article aria-busy="true" className="editorial-shell animate-fadeIn p-4 sm:p-7 lg:p-9">
              <TraceHeader
                word={word}
                language={language}
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
                  usageUnavailable={ngramState.status === 'unavailable'}
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

          {progress.status === 'success' &&
            resultWithNgram &&
            (progress.result?.language === 'ja' ? (
              <JapaneseEntryCard
                result={progress.result}
                searchedQuery={searchedQuery}
                matchExplanation={matchExplanation}
                onPlayPronunciation={handlePlayPronunciation}
                headerActions={<ShareMenu result={progress.result} />}
              />
            ) : (
              <EtymologyCard
                result={resultWithNgram}
                onWordClick={navigateToWord}
                headerActions={headerActions}
                contentLocale={contentLocale}
                historyChoices={historyChoices}
                activeHistoryId={selectedHistoryId}
                onHistoryChange={setActiveHistoryId}
                usageUnavailable={ngramState.status === 'unavailable'}
              />
            ))}
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

function TraceGate({
  word,
  language,
  candidate,
  searchedQuery,
  matchExplanation,
  onStart,
}: {
  word: string
  language: LanguageCode
  candidate?: LexemeCandidate
  searchedQuery?: string
  matchExplanation?: string
  onStart: () => void
}) {
  return (
    <>
      <header className="max-w-3xl pb-8">
        <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/66">
          uncharted entry{' '}
          {language !== 'en' && (
            <span className="normal-case font-serif tracking-normal text-accent-amber">
              · {BETA_SYMBOL}
            </span>
          )}
        </p>
        <h1
          className={`mt-3 break-words text-[clamp(2.8rem,13vw,4.8rem)] leading-[0.98] tracking-[-0.05em] text-charcoal ${language === 'ja' ? 'font-japanese' : 'font-serif'}`}
        >
          {candidate ? (
            <ruby>
              {candidate.lemma}
              <rp>(</rp>
              <rt>{candidate.reading}</rt>
              <rp>)</rp>
            </ruby>
          ) : (
            word
          )}
        </h1>
        {searchedQuery && searchedQuery !== word ? (
          <p className="mt-3 text-xs text-charcoal-light">
            You searched <span className="font-japanese text-charcoal">{searchedQuery}</span>
            {matchExplanation ? ` · ${matchExplanation}` : ''}
          </p>
        ) : null}
        <p className="mt-5 max-w-2xl font-serif text-xl italic leading-relaxed text-charcoal-light sm:text-[1.7rem]">
          {language === 'ja'
            ? 'This dictionary entry has not been traced yet. Its reading is known; reliable origin claims will only appear when the sources support them.'
            : 'This word has not been traced in the archive yet. Its older forms and borrowed meanings are still waiting to be followed back.'}
        </p>
        <div className="editorial-double-rule mt-8" />
      </header>

      <section className="mx-auto max-w-3xl pt-10">
        <div className="editorial-card flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="font-serif text-xl italic text-charcoal-light">no entry on file</p>
            <p className="mt-2 font-serif text-3xl tracking-[-0.03em] text-charcoal">
              Trace it live and watch the roots surface.
            </p>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="editorial-chip self-start whitespace-nowrap px-5 py-3 font-serif italic sm:self-center"
          >
            {language === 'ja' ? (
              <>Trace this entry live &rarr;</>
            ) : (
              <>Trace &ldquo;{word}&rdquo; live &rarr;</>
            )}
          </button>
        </div>
      </section>
    </>
  )
}
