'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { entryPagePath, type EntrySelection } from '@/lib/entrySelection'
import { useEntrySelection } from '@/lib/hooks/useEntrySelection'
import { entryNavigation } from '@/lib/entryNavigation'
import {
  getCompletedEntry,
  subscribeCompletedEntries,
  noCompletedEntry,
} from '@/lib/completedEntries'
import { EntryView } from '@/components/EntryView'
import { WordLink } from '@/components/WordLink'
import { ScriptLinks } from '@/components/ScriptLinks'
import { ErrorState } from '@/components/ErrorState'
import { EtymologyCard } from '@/components/EtymologyCard'
import { EntryHeader } from '@/components/etymology-card/EntryHeader'
import { EntryNavigation } from '@/components/EntryNavigation'
import { useLookupGroup } from '@/lib/hooks/useLookupGroup'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { TraceStatus } from '@/components/TraceStatus'
import { useNgram } from '@/lib/hooks/useNgram'
import { useStreamingEtymology } from '@/lib/hooks/useStreamingEtymology'
import { consumeTraceIntent, scheduleTraceIntent } from '@/lib/traceIntent'
import { toPartialResult, type StreamState } from '@/lib/streamReducer'
import { LANGUAGES, type LanguageCode } from '@/lib/languages'
import type { LookupGroup, WordEntry } from '@/lib/types'
import { spellingPronunciation } from '@/lib/scriptTargets'

interface WordTraceExperienceProps {
  word: string
  language?: LanguageCode
  initialEntry?: WordEntry
  stale?: boolean
  lookupGroup?: LookupGroup
  selection?: EntrySelection
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
  lookupGroup,
  selection: initialSelection,
}: WordTraceExperienceProps) {
  const router = useRouter()
  const completed = useSyncExternalStore(
    subscribeCompletedEntries,
    () => getCompletedEntry(word, language),
    noCompletedEntry
  )
  const restored = progressEntry(completed, language)
  const { progress, search } = useStreamingEtymology(language, word)
  const activeWord = progress.identity?.word ?? progress.result?.word ?? progress.word ?? word
  const activeLanguage = progress.identity?.language ?? language
  const selection = useEntrySelection(activeWord, activeLanguage, initialSelection)
  const { group } = useLookupGroup({
    word: activeWord,
    initial: lookupGroup,
    entry: progress.result ?? restored ?? initialEntry,
    lookup: selection.lookup,
    activity: progress.result || restored ? 'refresh' : undefined,
  })
  const selected =
    selection.language ??
    activeLanguage ??
    progress.result?.languages[0] ??
    progress.languages[0] ??
    initialEntry?.languages[0] ??
    'en'
  const slice = progress.byLanguage[selected]
  const savedTabs = progress.status === 'error' || activeWord === initialEntry?.word
  const navigation = entryNavigation({
    word: activeWord,
    language: selected,
    group,
    selection,
    entry: progress.result ?? restored ?? (savedTabs ? initialEntry : undefined),
    languages: progress.languages.length ? progress.languages : initialEntry?.languages,
    failedLanguages: progress.result?.failedLanguages ?? initialEntry?.failedLanguages,
    otherScripts:
      progress.status === 'error'
        ? undefined
        : (progress.result?.otherScripts ?? progress.otherScripts ?? initialEntry?.otherScripts),
  })
  const firstChoice = navigation.defaultTarget
  const openingDefault = Boolean(firstChoice)
  const defaultHref = firstChoice
    ? entryPagePath(firstChoice.word, firstChoice.language, {
        historyId: firstChoice.historyId,
        lookup: group?.reading,
      })
    : undefined
  useEffect(() => {
    if (defaultHref && progress.status === 'idle') router.replace(defaultHref, { scroll: false })
  }, [defaultHref, progress.status, router])
  const unavailable = Boolean(
    language &&
    initialEntry &&
    !stale &&
    initialEntry.attemptedLanguages?.includes(language) &&
    !initialEntry.entries[language]
  )
  const savedFailure = Boolean(language && initialEntry?.failedLanguages?.[language])
  const started = progress.status !== 'idle'
  // Start the usage-chart request alongside the trace so it is ready when the entry is.
  const ngram = useNgram(
    started && progress.languages.includes(selected) ? activeWord : null,
    selected
  )

  useEffect(() => {
    // The restored EntryView owns the explicit intent for related-entry checks.
    if (restored) return
    if (
      navigation.unresolved ||
      openingDefault ||
      savedFailure ||
      unavailable ||
      (initialEntry && stale)
    ) {
      consumeTraceIntent(word)
      return
    }
    return scheduleTraceIntent(word, language, search)
  }, [
    word,
    language,
    search,
    unavailable,
    savedFailure,
    initialEntry,
    stale,
    restored,
    openingDefault,
    navigation.unresolved,
  ])

  const partial = useMemo(() => {
    const streamed = toPartialResult(
      activeWord,
      navigation.grouped && !navigation.historyId ? {} : (slice?.sections ?? {}),
      selected
    )
    return { ...streamed, ngram: ngram.status === 'ready' ? ngram.data : undefined }
  }, [activeWord, selected, slice?.sections, ngram, navigation.grouped, navigation.historyId])

  const tabs = <EntryNavigation model={navigation} />
  const start = () => search(activeWord, selection.language ?? activeLanguage, { refresh: stale })

  return (
    <>
      <SiteHeader showSearch />
      <main className="mx-auto w-full max-w-3xl px-4 pt-14 sm:px-6 sm:pt-20">
        <div aria-live="polite" role="status" className="sr-only">
          {announcementFor(progress, activeWord)}
        </div>

        {progress.lookupResolution?.selected && (
          <p role="status" className="mb-6 text-sm text-muted">
            “{progress.lookupResolution.originalInput}” —{' '}
            {progress.lookupResolution.selected.relationship === 'form'
              ? 'looked up as a form of'
              : 'looked up as'}{' '}
            <span lang={progress.lookupResolution.language}>
              {progress.lookupResolution.selected.word}
            </span>
            .
          </p>
        )}

        {openingDefault && progress.status === 'idle' ? (
          <EntryHeader result={partial} subheader={tabs} pending />
        ) : progress.status === 'idle' && restored ? (
          <EntryView
            entry={restored}
            language={language}
            lookupGroup={group}
            selection={selection}
          />
        ) : savedFailure && initialEntry ? (
          <EntryView
            entry={initialEntry}
            language={language}
            stale={stale}
            lookupGroup={group}
            selection={selection}
          />
        ) : progress.status === 'success' && progress.result ? (
          <EntryView
            entry={progress.result}
            traceAlternatives
            lookupGroup={group}
            language={selected}
            selection={selection}
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
                  navigation.unresolved ? (
                    <div className="mt-8">
                      <p role="status" className="font-serif italic text-muted">
                        This lookup context is not available in the saved entries.
                      </p>
                      <WordLink
                        word={activeWord}
                        language={selected}
                        className="link mt-4 inline-block text-sm text-muted"
                      >
                        View all entries for {activeWord}
                      </WordLink>
                    </div>
                  ) : unavailable ? (
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
                    <ErrorState
                      error={progress.error}
                      language={selection.language ?? activeLanguage}
                      onRetry={start}
                    />
                  )
                )}
              </>
            }
          />
        )}
        <ScriptLinks
          targets={progress.lookupResolution?.sourceListed}
          heading="More dictionary entries"
          description="These entries are listed by the dictionary but haven’t been checked yet. Choose one to look it up."
        />
      </main>
      <SiteFooter />
    </>
  )
}

function progressEntry(
  entry: WordEntry | undefined,
  language?: LanguageCode
): WordEntry | undefined {
  return entry && (!language || entry.entries[language] || entry.failedLanguages?.[language])
    ? entry
    : undefined
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
