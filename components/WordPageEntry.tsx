'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { EtymologyCard } from '@/components/EtymologyCard'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import { ShareMenu } from '@/components/ShareMenu'
import { useHistory } from '@/lib/hooks/useHistory'
import { useNgram } from '@/lib/hooks/useNgram'
import { usePronunciation } from '@/lib/hooks/usePronunciation'
import { useWordNavigation } from '@/lib/hooks/useWordNavigation'
import { consumeTraceIntent } from '@/lib/traceIntent'
import type { EtymologyResult } from '@/lib/types'

interface WordPageEntryProps {
  result: EtymologyResult
}

/**
 * Client shell for the server-rendered /word/[word] page (cache hit).
 * Word clicks navigate to other /word pages, the viewed word joins the
 * local history, and the usage chart hydrates from /api/ngram.
 */
export function WordPageEntry({ result }: WordPageEntryProps) {
  const { navigateToWord, historyBack, historyForward } = useWordNavigation(result.word)
  const { addToHistory } = useHistory()
  const ngram = useNgram(result.word)
  const { play: playPronunciation } = usePronunciation(result.word)

  useEffect(() => {
    // The in-app navigation flag is single-use; clear it here so it can
    // never leak into a later uncached word page and auto-trace there.
    consumeTraceIntent(result.word)
    addToHistory(result.word)
  }, [result.word, addToHistory])

  const resultWithNgram = useMemo(
    () => ({ ...result, ngram: ngram && ngram.word === result.word ? ngram : undefined }),
    [result, ngram]
  )

  const headerActions = useMemo(() => <ShareMenu result={resultWithNgram} />, [resultWithNgram])

  const handlePlayPronunciation = useCallback(() => {
    void playPronunciation()
  }, [playPronunciation])

  return (
    <>
      <EtymologyCard
        result={resultWithNgram}
        onWordClick={navigateToWord}
        headerActions={headerActions}
      />
      <KeyboardShortcuts
        onHistoryBack={historyBack}
        onHistoryForward={historyForward}
        onPlayPronunciation={handlePlayPronunciation}
      />
    </>
  )
}
