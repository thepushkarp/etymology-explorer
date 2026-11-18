'use client'

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { WordLink } from '@/components/WordLink'
import { EtymologyCard } from '@/components/EtymologyCard'
import { EntryHeader } from '@/components/etymology-card/EntryHeader'
import { EntryNavigation } from '@/components/EntryNavigation'
import {
  getCompletedEntry,
  noCompletedEntry,
  subscribeCompletedEntries,
} from '@/lib/completedEntries'
import { entryNavigation } from '@/lib/entryNavigation'
import { entryPagePath, type EntrySelection } from '@/lib/entrySelection'
import { useLookupGroup } from '@/lib/hooks/useLookupGroup'
import { useEntrySelection } from '@/lib/hooks/useEntrySelection'
import { ScriptLinks } from '@/components/ScriptLinks'
import { ShareButton } from '@/components/ShareButton'
import { TraceStatus } from '@/components/TraceStatus'
import { useNgram } from '@/lib/hooks/useNgram'
import { useStreamingEtymology } from '@/lib/hooks/useStreamingEtymology'
import { scheduleTraceIntent } from '@/lib/traceIntent'
import { lookupGroupForWord } from '@/lib/lookupGroups'
import { LANGUAGES, type LanguageCode } from '@/lib/languages'
import { historyEntry } from '@/lib/resultHistories'
import { spellingPronunciation } from '@/lib/scriptTargets'
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
  traceAlternatives?: boolean
}

export function EntryView({
  entry,
  language,
  stale = false,
  selection: initialSelection,
  lookupGroup,
  traceAlternatives = false,
}: EntryViewProps) {
  const { progress, search } = useStreamingEtymology(undefined, entry.word, lookupGroup)
  const [backgroundWord, setBackgroundWord] = useState<string>()
  const [retryLanguage, setRetryLanguage] = useState<LanguageCode>()
  const completed = useSyncExternalStore(
    subscribeCompletedEntries,
    () => getCompletedEntry(entry.word, language),
    noCompletedEntry
  )
  const displayed =
    progress.result ??
    (completed && completed.word === entry.word && completed.tracedAt >= entry.tracedAt
      ? completed
      : entry)
  const selection = useEntrySelection(displayed.word, language, initialSelection)
  const selected = selection.language ?? language ?? displayed.languages[0]
  const result = selected ? displayed.entries[selected] : undefined
  const [explicitSearch, setExplicitSearch] = useState<{ word: string; lookup: string }>()
  // Retained same-page state must not reauthorize a consumed search on Back.
  if (
    explicitSearch &&
    (explicitSearch.word !== displayed.word ||
      explicitSearch.lookup !== (selection.lookup ?? displayed.word))
  ) {
    setExplicitSearch(undefined)
  }
  const intentWord =
    selection.lookup && lookupGroupForWord(selection.lookup, lookupGroup)
      ? selection.lookup
      : entry.word
  const related = useLookupGroup({
    word: displayed.word,
    initial: lookupGroup,
    entry: displayed,
    lookup: selection.lookup,
    activity:
      (explicitSearch?.word === displayed.word &&
        explicitSearch.lookup === (selection.lookup ?? displayed.word)) ||
      ((traceAlternatives || progress.result) && !selection.lookup)
        ? 'trace'
        : progress.result
          ? 'refresh'
          : undefined,
  })
  const { group, preview } = related
  const histories =
    preview?.word === displayed.word && preview.language === selected
      ? preview.histories
      : undefined
  const selectedPreview = histories?.find((h) => h.id === selection.historyId)
  const navigation = entryNavigation({
    word: displayed.word,
    language: selected,
    entry: displayed,
    group,
    selection,
    otherScripts: displayed.otherScripts,
    histories: histories ?? result?.histories,
  })
  const { historyId } = navigation
  const failure = selected ? displayed.failedLanguages?.[selected] : undefined
  const spellings = displayed.spellings?.filter((spelling) => spelling.language === selected) ?? []

  const recovering = progress.status === 'loading' && retryLanguage === selected
  const background = backgroundWord === displayed.word && progress.status === 'loading'
  const showProgress =
    progress.status === 'loading' && !background && (!retryLanguage || recovering)

  useEffect(() => {
    // A server default redirect retains the validated lookup owner. Meaning
    // links consume no new search intent, so only an explicit search starts the batch.
    return scheduleTraceIntent(intentWord, undefined, (_, hint) => {
      setExplicitSearch({ word: entry.word, lookup: intentWord })
      if (stale && result && !failure && displayed === entry && progress.status !== 'loading') {
        setBackgroundWord(entry.word)
        search(entry.word, hint, { refresh: true })
      }
    })
  }, [entry, intentWord, stale, result, failure, displayed, progress.status, search])

  const navigationRow = <EntryNavigation model={navigation} />
  const notices = (
    <>
      {related.loading && (
        <p role="status" className="mt-3 text-sm text-muted">
          {related.status ?? 'Checking related entries…'}
        </p>
      )}
      {related.error && (
        <p role="status" className="mt-3 text-sm text-muted">
          {related.error}{' '}
          <button type="button" className="link" onClick={related.retry}>
            Retry
          </button>
        </p>
      )}
      {group && !group.choices.length && !related.loading && !related.error && (
        <button type="button" className="link mt-3 text-sm text-muted" onClick={related.retry}>
          Check related entries
        </button>
      )}
    </>
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
        setBackgroundWord(undefined)
        setRetryLanguage(selected)
        search(displayed.word, selected, { refresh: true })
      }}
    />
  )
  const actions = (
    <div className="flex items-center gap-4">
      {stale && !progress.result && (
        <button
          type="button"
          className="link text-sm text-muted"
          disabled={progress.status === 'loading'}
          onClick={() => {
            setBackgroundWord(undefined)
            setRetryLanguage(undefined)
            search(entry.word, selected, { refresh: true })
          }}
        >
          {progress.status === 'loading' ? 'Retracing…' : 'Retrace'}
        </button>
      )}
      <ShareButton />
    </div>
  )
  if (navigation.defaultTarget && !selection.historyId && progress.status !== 'loading') {
    const target = navigation.defaultTarget
    return (
      <OpenDefaultEntry href={entryPagePath(target.word, target.language, target)}>
        <EntryHeader
          result={toPartialResult(displayed.word, {}, selected)}
          navigation={navigationRow}
          subheader={notices}
          actions={actions}
          pending
        />
      </OpenDefaultEntry>
    )
  }
  if (selectedPreview)
    return (
      <EtymologyCard
        result={toPartialResult(displayed.word, selectedPreview, selected)}
        navigation={navigationRow}
        subheader={notices}
        actions={actions}
      />
    )
  if (!result || navigation.unresolved) {
    return (
      <EntryHeader
        actions={actions}
        navigation={navigationRow}
        result={toPartialResult(displayed.word, {}, selected)}
        subheader={
          <>
            {notices}
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
      navigation={navigationRow}
      spellings={spellings}
      subheader={
        <>
          {notices}
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
      actions={actions}
      status={progress.status === 'error' && !failure ? progress.error?.message : undefined}
    />
  )
}

function OpenDefaultEntry({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(href, { scroll: false })
  }, [router, href])
  return children
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
  navigation,
  result,
  subheader,
  actions,
  status,
  spellings,
  historyId,
  grouped,
}: {
  result: EtymologyResult
  navigation: ReactNode
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
      navigation={navigation}
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
