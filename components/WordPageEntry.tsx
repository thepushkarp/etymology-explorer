'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { EtymologyCard } from '@/components/EtymologyCard'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import { ResultEditionSwitch } from '@/components/ResultEditionSwitch'
import { ShareMenu } from '@/components/ShareMenu'
import { useHistory } from '@/lib/hooks/useHistory'
import { useNgram } from '@/lib/hooks/useNgram'
import { usePronunciation } from '@/lib/hooks/usePronunciation'
import { useWordNavigation } from '@/lib/hooks/useWordNavigation'
import { consumeTraceIntent } from '@/lib/traceIntent'
import type { EtymologyResult } from '@/lib/types'
import type { BetaLanguageCode } from '@/lib/languages'
import { localizeResult, type ResultLocale } from '@/lib/resultLocalization'

interface WordPageEntryProps {
  result: EtymologyResult
}

/**
 * Client shell for the server-rendered /word/[word] page (cache hit).
 * Word clicks navigate to other /word pages, the viewed word joins the
 * local history, and the usage chart hydrates from /api/ngram.
 */
export function WordPageEntry({ result }: WordPageEntryProps) {
  const language = result.language ?? 'en'
  const [contentLocale, setContentLocale] = useState<ResultLocale>(
    language === 'en' ? 'en' : 'local'
  )
  const { navigateToWord, historyBack, historyForward } = useWordNavigation(result.word, language)
  const { addToHistory } = useHistory()
  const ngram = useNgram(result.word, language)
  const { play: playPronunciation } = usePronunciation(result.word, language)

  useEffect(() => {
    // The in-app navigation flag is single-use; clear it here so it can
    // never leak into a later uncached word page and auto-trace there.
    consumeTraceIntent(result.word, language)
    addToHistory(result.word, language)
  }, [result.word, language, addToHistory])

  const resultWithNgram = useMemo(() => {
    const enriched = { ...result, ngram: ngram && ngram.word === result.word ? ngram : undefined }
    return localizeResult(enriched, contentLocale)
  }, [result, ngram, contentLocale])

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
      />
      <KeyboardShortcuts
        onHistoryBack={historyBack}
        onHistoryForward={historyForward}
        onPlayPronunciation={handlePlayPronunciation}
      />
    </>
  )
}
