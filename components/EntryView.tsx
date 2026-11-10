'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { EtymologyCard } from '@/components/EtymologyCard'
import { EntryHeader } from '@/components/etymology-card/EntryHeader'
import { EntrySelector } from '@/components/etymology-card/EntrySelector'
import { LanguageTabs } from '@/components/LanguageTabs'
import { ScriptLinks } from '@/components/ScriptLinks'
import { ShareButton } from '@/components/ShareButton'
import { TraceStatus } from '@/components/TraceStatus'
import { useNgram } from '@/lib/hooks/useNgram'
import { useStreamingEtymology } from '@/lib/hooks/useStreamingEtymology'
import { consumeTraceIntent } from '@/lib/traceIntent'
import { LANGUAGES, wordPagePath, type LanguageCode } from '@/lib/languages'
import { historyChoices, historyEntry } from '@/lib/resultHistories'
import { spellingPronunciation } from '@/lib/scriptTargets'
import { toPartialResult } from '@/lib/streamReducer'
import type { EntrySpelling, EtymologyResult, LanguageFailure, WordEntry } from '@/lib/types'

interface EntryViewProps {
  entry: WordEntry
  language?: LanguageCode
  stale?: boolean
  /** Live results switch tabs locally until a new page is loaded. */
  onSelectLanguage?: (language: LanguageCode) => void
}

export function EntryView({ entry, language, stale = false, onSelectLanguage }: EntryViewProps) {
  const { progress, search } = useStreamingEtymology(undefined, entry.word)
  const [refreshedLanguage, setRefreshedLanguage] = useState<LanguageCode>()
  const [retryLanguage, setRetryLanguage] = useState<LanguageCode>()
  const displayed = progress.result ?? entry
  const selected = refreshedLanguage ?? language ?? displayed.languages[0]
  const result = selected ? displayed.entries[selected] : undefined
  const failure = selected ? displayed.failedLanguages?.[selected] : undefined
  const spellings = displayed.spellings?.filter((spelling) => spelling.language === selected) ?? []

  const recovering = progress.status === 'loading' && retryLanguage === selected
  const showProgress = progress.status === 'loading' && (!retryLanguage || recovering)

  useEffect(() => {
    consumeTraceIntent(entry.word)
  }, [entry.word])

  const tabs = (
    <LanguageTabs
      word={displayed.word}
      languages={displayed.languages}
      failedLanguages={displayed.failedLanguages}
      otherLanguages={displayed.otherLanguages}
      otherScripts={displayed.otherScripts}
      language={selected}
      onSelect={
        onSelectLanguage || progress.status !== 'idle'
          ? (code) => {
              setRefreshedLanguage(code)
              onSelectLanguage?.(code)
            }
          : undefined
      }
    />
  )
  const recovery = failure && (
    <FailedLanguage
      key={`${selected}:${failure.retryAt}`}
      language={selected}
      failure={failure}
      busy={progress.status === 'loading'}
      loading={recovering}
      error={progress.status === 'error' ? progress.error?.message : undefined}
      onRetry={() => {
        setRetryLanguage(selected)
        search(displayed.word, selected, { refresh: true })
      }}
    />
  )
  if (!result) {
    return (
      <EntryHeader
        result={toPartialResult(displayed.word, {}, selected)}
        subheader={
          <>
            {tabs}
            {failure ? (
              recovery
            ) : (
              <p role="status" className="mt-8 font-serif italic text-muted">
                {progress.byLanguage[selected]?.error ??
                  (selected &&
                  displayed.incomplete &&
                  !displayed.attemptedLanguages?.includes(selected)
                    ? `The ${LANGUAGES[selected].englishName} entry is temporarily unavailable. Try again later.`
                    : selected
                      ? `No supported ${LANGUAGES[selected].englishName} entry was found for “${displayed.word}”.`
                      : `No supported entry was found for “${displayed.word}”.`)}
              </p>
            )}
            {showProgress && <TraceStatus progress={progress} language={selected} />}
          </>
        }
      />
    )
  }

  return (
    <FinishedLanguage
      key={`${result.language}:${result.primaryHistoryId}`}
      result={result}
      spellings={spellings}
      subheader={
        <>
          {tabs}
          {recovery}
          {spellings.length > 0 && (
            <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm text-muted">
              <span>Also written</span>
              {spellings.map((spelling) => (
                <span key={spelling.word}>
                  <Link
                    href={wordPagePath(displayed.word, spelling.language)}
                    lang={spelling.language}
                    dir="auto"
                    className="link font-serif text-ink"
                  >
                    {spelling.word}
                  </Link>
                  {spelling.kind === 'misspelling' && ' (misspelling)'}
                </span>
              ))}
            </p>
          )}
          {showProgress && <TraceStatus progress={progress} language={selected} />}
        </>
      }
      actions={
        <div className="flex items-center gap-4">
          {stale && !progress.result && (
            <button
              type="button"
              className="link text-sm text-muted"
              disabled={progress.status === 'loading'}
              onClick={() => {
                setRetryLanguage(undefined)
                search(entry.word, language, { refresh: true })
              }}
            >
              {progress.status === 'loading' ? 'Retracing…' : 'Retrace'}
            </button>
          )}
          <ShareButton />
        </div>
      }
      status={progress.status === 'error' && !failure ? progress.error?.message : undefined}
    />
  )
}

function FailedLanguage({
  language,
  failure,
  busy,
  loading,
  error,
  onRetry,
}: {
  language: LanguageCode
  failure: LanguageFailure
  busy: boolean
  loading: boolean
  error?: string
  onRetry: () => void
}) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const remaining = Date.parse(failure.retryAt) - Date.now()
    // The timer only enables a human action; it never starts a trace.
    const timer = window.setTimeout(() => setReady(true), Math.max(0, remaining))
    return () => window.clearTimeout(timer)
  }, [failure.retryAt])

  return (
    <div className="mt-8">
      <p role="status" className="font-serif italic text-muted">
        {error ?? failure.message}
      </p>
      {!ready && (
        <p className="mt-3 text-sm text-muted">
          You can retry after{' '}
          <time dateTime={failure.retryAt}>{new Date(failure.retryAt).toUTCString()}</time>.
        </p>
      )}
      <button
        type="button"
        className="link mt-4 text-sm text-muted disabled:cursor-wait disabled:no-underline"
        disabled={!ready || busy}
        onClick={onRetry}
      >
        {loading
          ? `Retrying ${LANGUAGES[language].englishName}…`
          : `Retry ${LANGUAGES[language].englishName}`}
      </button>
    </div>
  )
}

function FinishedLanguage({
  result,
  subheader,
  actions,
  status,
  spellings,
}: {
  result: EtymologyResult
  subheader: ReactNode
  actions: ReactNode
  status?: string
  spellings: EntrySpelling[]
}) {
  const [historyId, setHistoryId] = useState(result.primaryHistoryId)
  const ngram = useNgram(result.word, result.language)
  const display = useMemo(
    () => ({
      ...historyEntry(result, historyId),
      ngram: ngram.status === 'ready' ? ngram.data : undefined,
    }),
    [result, ngram, historyId]
  )
  const choices = historyChoices(result)

  return (
    <EtymologyCard
      result={display}
      pronunciationWord={
        result.histories.length === 1
          ? spellingPronunciation(result.language, spellings)
          : undefined
      }
      usageUnavailable={ngram.status === 'unavailable'}
      actions={actions}
      subheader={
        <>
          {subheader}
          {status && (
            <p role="status" className="mt-4 text-sm text-muted">
              {status}
            </p>
          )}
          <EntrySelector
            word={result.word}
            entries={choices}
            activeEntryId={historyId}
            onChange={setHistoryId}
          />
          <ScriptLinks
            targets={display.counterparts?.filter(
              (target) =>
                !spellings.some(
                  (spelling) =>
                    spelling.word === target.word && spelling.language === target.language
                )
            )}
          />
        </>
      }
    />
  )
}
