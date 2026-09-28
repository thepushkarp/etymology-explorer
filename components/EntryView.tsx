'use client'

import { useEffect, useMemo, useState } from 'react'
import { EtymologyCard } from '@/components/EtymologyCard'
import { EntrySelector } from '@/components/etymology-card/EntrySelector'
import { ResultEditionSwitch } from '@/components/ResultEditionSwitch'
import { ShareButton } from '@/components/ShareButton'
import { useNgram } from '@/lib/hooks/useNgram'
import { consumeTraceIntent } from '@/lib/traceIntent'
import type { BetaLanguageCode } from '@/lib/languages'
import { localizeHistoryChoices, localizeResult, type ResultLocale } from '@/lib/resultLocalization'
import type { EtymologyResult } from '@/lib/types'

/**
 * A finished entry, whether served from cache or just traced live: reading
 * edition (beta languages), homograph histories, usage chart, and sharing.
 */
export function EntryView({ result }: { result: EtymologyResult }) {
  const language = result.language ?? 'en'
  const [locale, setLocale] = useState<ResultLocale>(language === 'en' ? 'en' : 'local')
  const [historyId, setHistoryId] = useState(
    'primaryHistoryId' in result ? result.primaryHistoryId : undefined
  )
  const ngram = useNgram(result.word, language)

  // The in-app navigation flag is single-use; clear it so it can never leak
  // into a later uncached word page and auto-trace there.
  useEffect(() => {
    consumeTraceIntent(result.word, language)
  }, [result.word, language])

  const display = useMemo(
    () =>
      localizeResult(
        { ...result, ngram: ngram.status === 'ready' ? ngram.data : undefined },
        locale,
        historyId
      ),
    [result, ngram, locale, historyId]
  )
  const choices = useMemo(() => localizeHistoryChoices(result, locale), [result, locale])

  return (
    <EtymologyCard
      result={display}
      contentLocale={locale}
      usageUnavailable={ngram.status === 'unavailable'}
      actions={
        <div className="flex items-center gap-5">
          {language !== 'en' && (
            <ResultEditionSwitch
              language={language as BetaLanguageCode}
              locale={locale}
              onChange={setLocale}
            />
          )}
          <ShareButton />
        </div>
      }
      subheader={
        historyId && (
          <EntrySelector
            word={result.word}
            entries={choices}
            activeEntryId={historyId}
            onChange={setHistoryId}
          />
        )
      }
    />
  )
}
