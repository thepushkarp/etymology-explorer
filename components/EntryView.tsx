'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { EtymologyCard } from '@/components/EtymologyCard'
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
import type { EntrySpelling, EtymologyResult, WordEntry } from '@/lib/types'

interface EntryViewProps {
  entry: WordEntry
  language?: LanguageCode
  stale?: boolean
  /** Live results switch tabs locally until a new page is loaded. */
  onSelectLanguage?: (language: LanguageCode) => void
  languageTabs?: ReactNode
  unavailableMessage?: string
}

export function EntryView({
  entry,
  language,
  stale = false,
  onSelectLanguage,
  languageTabs,
  unavailableMessage,
}: EntryViewProps) {
  const { progress, search } = useStreamingEtymology(language, entry.word)
  const [refreshedLanguage, setRefreshedLanguage] = useState<LanguageCode>()
  const displayed = progress.result ?? entry
  const requested = refreshedLanguage ?? language ?? displayed.languages[0]
  const selected =
    progress.result && !displayed.entries[requested] && !progress.languages.includes(requested)
      ? displayed.languages[0]
      : requested
  const result = selected ? displayed.entries[selected] : undefined
  const spellings = displayed.spellings?.filter((spelling) => spelling.language === selected) ?? []

  useEffect(() => {
    consumeTraceIntent(entry.word)
  }, [entry.word])

  const tabs = languageTabs ?? (
    <LanguageTabs
      word={displayed.word}
      languages={progress.result ? progress.languages : displayed.languages}
      otherLanguages={displayed.otherLanguages}
      otherScripts={displayed.otherScripts}
      language={selected}
      onSelect={onSelectLanguage ?? (progress.result ? setRefreshedLanguage : undefined)}
    />
  )
  if (!result) {
    return (
      <>
        {tabs}
        <p role="status" className="mt-8 font-serif italic text-muted">
          {unavailableMessage ??
            progress.byLanguage[selected]?.error ??
            (selected && displayed.incomplete && !displayed.attemptedLanguages?.includes(selected)
              ? `The ${LANGUAGES[selected].englishName} entry is temporarily unavailable. Try again later.`
              : selected
                ? `No supported ${LANGUAGES[selected].englishName} entry was found for “${displayed.word}”.`
                : `No supported entry was found for “${displayed.word}”.`)}
        </p>
      </>
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
          {progress.status === 'loading' && <TraceStatus progress={progress} language={selected} />}
        </>
      }
      actions={
        <div className="flex items-center gap-4">
          {stale && !progress.result && (
            <button
              type="button"
              className="link text-sm text-muted"
              disabled={progress.status === 'loading'}
              onClick={() => search(entry.word, language, { refresh: true })}
            >
              {progress.status === 'loading' ? 'Retracing…' : 'Retrace'}
            </button>
          )}
          <ShareButton />
        </div>
      }
      status={progress.status === 'error' ? progress.error?.message : undefined}
    />
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
