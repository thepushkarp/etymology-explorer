'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { EtymologyCard } from '@/components/EtymologyCard'
import { EntrySelector } from '@/components/etymology-card/EntrySelector'
import { LanguageTabs } from '@/components/LanguageTabs'
import { ScriptLinks } from '@/components/ScriptLinks'
import { ShareButton } from '@/components/ShareButton'
import { useNgram } from '@/lib/hooks/useNgram'
import { useStreamingEtymology } from '@/lib/hooks/useStreamingEtymology'
import { consumeTraceIntent } from '@/lib/traceIntent'
import { LANGUAGES, type LanguageCode } from '@/lib/languages'
import { historyChoices, historyEntry } from '@/lib/resultHistories'
import type { EtymologyResult, WordEntry } from '@/lib/types'

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
  const { progress, search } = useStreamingEtymology()
  const [refreshedLanguage, setRefreshedLanguage] = useState<LanguageCode>()
  const displayed = progress.result ?? entry
  const requested = refreshedLanguage ?? language ?? displayed.languages[0]
  const selected =
    progress.result && !displayed.entries[requested] && !progress.languages.includes(requested)
      ? displayed.languages[0]
      : requested
  const result = selected ? displayed.entries[selected] : undefined

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
      subheader={tabs}
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
      status={
        progress.status === 'error'
          ? progress.error?.message
          : progress.status === 'loading'
            ? 'Retracing this entry…'
            : undefined
      }
    />
  )
}

function FinishedLanguage({
  result,
  subheader,
  actions,
  status,
}: {
  result: EtymologyResult
  subheader: ReactNode
  actions: ReactNode
  status?: string
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
          <ScriptLinks targets={display.counterparts} />
        </>
      }
    />
  )
}
