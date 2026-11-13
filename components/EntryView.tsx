'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { WordLink } from '@/components/WordLink'
import { EtymologyCard } from '@/components/EtymologyCard'
import { EntryHeader } from '@/components/etymology-card/EntryHeader'
import { EntryNavigation } from '@/components/EntryNavigation'
import { entryNavigation } from '@/lib/entryNavigation'
import type { EntrySelection } from '@/lib/entrySelection'
import { useLookupGroup } from '@/lib/hooks/useLookupGroup'
import { useEntrySelection } from '@/lib/hooks/useEntrySelection'
import { ScriptLinks } from '@/components/ScriptLinks'
import { ShareButton } from '@/components/ShareButton'
import { TraceStatus } from '@/components/TraceStatus'
import { useNgram } from '@/lib/hooks/useNgram'
import { useStreamingEtymology } from '@/lib/hooks/useStreamingEtymology'
import { consumeTraceIntent } from '@/lib/traceIntent'
import { LANGUAGES, type LanguageCode } from '@/lib/languages'
import { historyEntry } from '@/lib/resultHistories'
import { relevantScriptTargets, spellingPronunciation } from '@/lib/scriptTargets'
import { toPartialResult } from '@/lib/streamReducer'
import type {
  EntrySpelling,
  EtymologyResult,
  LanguageFailure,
  LookupGroup,
  WordEntry,
} from '@/lib/types'

interface EntryViewProps {
  entry: WordEntry
  language?: LanguageCode
  stale?: boolean
  lookupGroup?: LookupGroup
  selection?: EntrySelection
}

export function EntryView({
  entry,
  language,
  stale = false,
  selection: initialSelection,
  lookupGroup,
}: EntryViewProps) {
  const { progress, search } = useStreamingEtymology(undefined, entry.word)
  const [retryLanguage, setRetryLanguage] = useState<LanguageCode>()
  const displayed = progress.result ?? entry
  const selection = useEntrySelection(displayed.word, language, initialSelection)
  const selected = selection.language ?? language ?? displayed.languages[0]
  const result = selected ? displayed.entries[selected] : undefined
  const group = useLookupGroup(
    displayed.word,
    lookupGroup,
    displayed,
    selection.lookup,
    Boolean(progress.result)
  )
  const navigation = entryNavigation({
    word: displayed.word,
    language: selected,
    entry: displayed,
    group,
    selection,
    otherScripts: relevantScriptTargets(
      displayed.otherScripts,
      Object.values(displayed.entries),
      selected
    ),
  })
  const { historyId } = navigation
  const failure = selected ? displayed.failedLanguages?.[selected] : undefined
  const spellings = displayed.spellings?.filter((spelling) => spelling.language === selected) ?? []

  const recovering = progress.status === 'loading' && retryLanguage === selected
  const showProgress = progress.status === 'loading' && (!retryLanguage || recovering)

  useEffect(() => {
    consumeTraceIntent(entry.word)
  }, [entry.word])

  const tabs = <EntryNavigation model={navigation} />
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
  if (!result || navigation.unresolved) {
    return (
      <EntryHeader
        result={toPartialResult(displayed.word, {}, selected)}
        subheader={
          <>
            {tabs}
            {navigation.unresolved ? (
              <div className="mt-8">
                <p role="status" className="font-serif italic text-muted">
                  This reading is not available in the saved entry.
                </p>
                <WordLink
                  word={displayed.word}
                  language={selected}
                  className="link mt-4 inline-block text-sm text-muted"
                >
                  View all entries for {displayed.word}
                </WordLink>
              </div>
            ) : failure ? (
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
      historyId={historyId!}
      grouped={navigation.grouped}
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
                  <WordLink
                    word={displayed.word}
                    language={spelling.language}
                    historyId={historyId}
                    lookup={group?.reading}
                    lang={spelling.language}
                    className="link font-serif text-ink"
                  >
                    {spelling.word}
                  </WordLink>
                  {spelling.kind === 'misspelling' && ' (misspelling)'}
                  {spelling.kind === 'romanization' && ' (rōmaji)'}
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
                search(entry.word, selected, { refresh: true })
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
  historyId,
  grouped,
}: {
  result: EtymologyResult
  subheader: ReactNode
  actions: ReactNode
  status?: string
  spellings: EntrySpelling[]
  historyId: string
  grouped: boolean
}) {
  const ngram = useNgram(result.word, result.language)
  const display = useMemo(
    () => ({
      ...historyEntry(result, historyId),
      ngram: ngram.status === 'ready' ? ngram.data : undefined,
    }),
    [result, ngram, historyId]
  )

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
          {!grouped && (
            <ScriptLinks
              heading="Other written forms"
              targets={display.counterparts?.filter(
                (target) =>
                  !spellings.some(
                    (spelling) =>
                      spelling.word === target.word && spelling.language === target.language
                  )
              )}
            />
          )}
        </>
      }
    />
  )
}
