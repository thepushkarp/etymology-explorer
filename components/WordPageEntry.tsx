'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { EtymologyCard } from '@/components/EtymologyCard'
import { JapaneseEntryCard } from '@/components/japanese/JapaneseEntryCard'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import { ResultEditionSwitch } from '@/components/ResultEditionSwitch'
import { ShareMenu } from '@/components/ShareMenu'
import { useHistory } from '@/lib/hooks/useHistory'
import { useNgram } from '@/lib/hooks/useNgram'
import { usePronunciation } from '@/lib/hooks/usePronunciation'
import { useWordNavigation } from '@/lib/hooks/useWordNavigation'
import { consumeTraceIntent } from '@/lib/traceIntent'
import type { EtymologyResult, LearnerEtymologyResult } from '@/lib/types'
import type { BetaLanguageCode } from '@/lib/languages'
import { localizeHistoryChoices, localizeResult, type ResultLocale } from '@/lib/resultLocalization'

interface WordPageEntryProps {
  result: EtymologyResult
  searchedQuery?: string
  matchExplanation?: string
}

/**
 * Client shell for the server-rendered /word/[word] page (cache hit).
 * Word clicks navigate to other /word pages, the viewed word joins the
 * local history, and the usage chart hydrates from /api/ngram.
 */
export function WordPageEntry(props: WordPageEntryProps) {
  if (props.result.language === 'ja') {
    return <JapaneseWordPageEntry {...props} result={props.result} />
  }
  return <StandardWordPageEntry {...props} />
}

function JapaneseWordPageEntry({
  result,
  searchedQuery,
  matchExplanation,
}: WordPageEntryProps & { result: LearnerEtymologyResult }) {
  const { addToHistory } = useHistory()
  const { play } = usePronunciation(result.word, 'ja', result.entryId)
  const { historyBack, historyForward } = useWordNavigation(result.word, 'ja', result.entryId)

  useEffect(() => {
    consumeTraceIntent(result.word, 'ja', result.entryId)
    addToHistory(result.word, 'ja', result.entryId)
  }, [result.word, result.entryId, addToHistory])

  const handlePlay = useCallback(() => void play(), [play])
  return (
    <>
      <JapaneseEntryCard
        result={result}
        searchedQuery={searchedQuery}
        matchExplanation={matchExplanation}
        onPlayPronunciation={handlePlay}
        headerActions={<ShareMenu result={result} />}
      />
      <KeyboardShortcuts
        onHistoryBack={historyBack}
        onHistoryForward={historyForward}
        onPlayPronunciation={handlePlay}
      />
    </>
  )
}

function StandardWordPageEntry({ result }: WordPageEntryProps) {
  const language = result.language ?? 'en'
  const [contentLocale, setContentLocale] = useState<ResultLocale>(
    language === 'en' ? 'en' : 'local'
  )
  const [activeHistoryId, setActiveHistoryId] = useState<string | undefined>(
    'primaryHistoryId' in result ? result.primaryHistoryId : undefined
  )
  const { navigateToWord, historyBack, historyForward } = useWordNavigation(result.word, language)
  const { addToHistory } = useHistory()
  const ngramState = useNgram(result.word, language)
  const ngram = ngramState.status === 'ready' ? ngramState.data : null
  const { play: playPronunciation } = usePronunciation(result.word, language)

  useEffect(() => {
    // The in-app navigation flag is single-use; clear it here so it can
    // never leak into a later uncached word page and auto-trace there.
    consumeTraceIntent(result.word, language)
    addToHistory(result.word, language)
  }, [result.word, language, addToHistory])

  const resultWithNgram = useMemo(() => {
    const enriched = { ...result, ngram: ngram && ngram.word === result.word ? ngram : undefined }
    return localizeResult(enriched, contentLocale, activeHistoryId)
  }, [result, ngram, contentLocale, activeHistoryId])
  const historyChoices = useMemo(
    () => localizeHistoryChoices(result, contentLocale),
    [result, contentLocale]
  )

  const headerActions = useMemo(
    () => (
      <div className="flex items-center justify-end gap-2">
        {language !== 'en' && (
          <ResultEditionSwitch
            language={language as BetaLanguageCode}
            locale={contentLocale}
            onChange={setContentLocale}
          />
        )}
        <ShareMenu result={resultWithNgram} />
      </div>
    ),
    [resultWithNgram, language, contentLocale]
  )

  const handlePlayPronunciation = useCallback(() => {
    void playPronunciation()
  }, [playPronunciation])

  return (
    <>
      <EtymologyCard
        result={resultWithNgram}
        onWordClick={navigateToWord}
        headerActions={headerActions}
        contentLocale={contentLocale}
        historyChoices={historyChoices}
        activeHistoryId={activeHistoryId}
        onHistoryChange={setActiveHistoryId}
        usageUnavailable={ngramState.status === 'unavailable'}
      />
      <KeyboardShortcuts
        onHistoryBack={historyBack}
        onHistoryForward={historyForward}
        onPlayPronunciation={handlePlayPronunciation}
      />
    </>
  )
}
