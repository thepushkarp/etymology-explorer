'use client'

import { useEffect, useMemo, useState } from 'react'
import { EntryView } from '@/components/EntryView'
import { ErrorState } from '@/components/ErrorState'
import { EtymologyCard } from '@/components/EtymologyCard'
import { LanguageTabs } from '@/components/LanguageTabs'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { TraceStatus } from '@/components/TraceStatus'
import { useNgram } from '@/lib/hooks/useNgram'
import { useStreamingEtymology } from '@/lib/hooks/useStreamingEtymology'
import { consumeTraceIntent, scheduleTraceIntent } from '@/lib/traceIntent'
import { toPartialResult, type StreamState } from '@/lib/streamReducer'
import { LANGUAGES, type LanguageCode } from '@/lib/languages'
import type { WordEntry } from '@/lib/types'
import { spellingPronunciation } from '@/lib/scriptTargets'

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
  const { progress, search } = useStreamingEtymology(language, word)
  const activeWord = progress.identity?.word ?? progress.result?.word ?? progress.word ?? word
  const activeLanguage = progress.identity?.language ?? language
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>()
  const selected =
    (progress.status === 'error' ? activeLanguage : selectedLanguage) ??
    activeLanguage ??
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
  const ngram = useNgram(
    started && progress.languages.includes(selected) ? activeWord : null,
    selected
  )

  useEffect(() => {
    if (unavailable || (initialEntry && stale)) {
      consumeTraceIntent(word)
      return
    }
    return scheduleTraceIntent(word, language, search)
  }, [word, language, search, unavailable, initialEntry, stale])

  const partial = useMemo(() => {
    const streamed = toPartialResult(activeWord, slice?.sections ?? {}, selected)
    return { ...streamed, ngram: ngram.status === 'ready' ? ngram.data : undefined }
  }, [activeWord, selected, slice?.sections, ngram])

  const savedTabs = progress.status === 'error' || activeWord === initialEntry?.word

  const tabs = (
    <LanguageTabs
      word={savedTabs && initialEntry ? initialEntry.word : activeWord}
      languages={
        progress.status === 'error' && initialEntry
          ? initialEntry.languages
          : progress.languages.length
            ? progress.languages
            : ((savedTabs ? initialEntry?.languages : []) ?? [])
      }
      otherLanguages={
        progress.otherLanguages.length
          ? progress.otherLanguages
          : ((savedTabs ? initialEntry?.otherLanguages : []) ?? [])
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
  const start = () => search(activeWord, activeLanguage, { refresh: stale })

  return (
    <>
      <SiteHeader showSearch searchLanguage={activeLanguage} />
      <main className="mx-auto w-full max-w-3xl px-4 pt-14 sm:px-6 sm:pt-20">
        <div aria-live="polite" role="status" className="sr-only">
          {announcementFor(progress, activeWord)}
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
            pronunciationWord={spellingPronunciation(selected, progress.identity?.spellings)}
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
                      <TraceStatus progress={progress} language={selected} />
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
