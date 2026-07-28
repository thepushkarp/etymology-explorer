'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { EtymologyCard } from '@/components/EtymologyCard'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import { ShareMenu } from '@/components/ShareMenu'
import { useHistory } from '@/lib/hooks/useHistory'
import { useNgram } from '@/lib/hooks/useNgram'
import { usePronunciation } from '@/lib/hooks/usePronunciation'
import { useWordNavigation } from '@/lib/hooks/useWordNavigation'
import { consumeTraceIntent } from '@/lib/traceIntent'
import type { EtymologyResult } from '@/lib/types'
import { LANGUAGES, type BetaLanguageCode } from '@/lib/languages'
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
      <div className="flex flex-wrap items-center justify-end gap-2">
        {language !== 'en' && (
          <div
            className="inline-flex rounded-full border border-border-soft bg-surface p-1"
            role="group"
            aria-label="Result language"
          >
            <ToggleButton active={contentLocale === 'en'} onClick={() => setContentLocale('en')}>
              English
            </ToggleButton>
            <ToggleButton
              active={contentLocale === 'local'}
              onClick={() => setContentLocale('local')}
            >
              {LANGUAGES[language as BetaLanguageCode].nativeName}
            </ToggleButton>
          </div>
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

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
        active ? 'bg-charcoal text-cream' : 'text-charcoal-light hover:text-charcoal'
      }`}
    >
      {children}
    </button>
  )
}
