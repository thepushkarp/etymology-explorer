'use client'

import { useEffect, useMemo, useState } from 'react'
import { EtymologyCard } from '@/components/EtymologyCard'
import { EntrySelector } from '@/components/etymology-card/EntrySelector'
import { ShareButton } from '@/components/ShareButton'
import { useNgram } from '@/lib/hooks/useNgram'
import { consumeTraceIntent } from '@/lib/traceIntent'
import { historyChoices, historyEntry } from '@/lib/resultHistories'
import type { EtymologyResult } from '@/lib/types'

/**
 * A finished entry, whether served from cache or just traced live: homograph
 * histories, usage chart, and sharing.
 */
export function EntryView({ result }: { result: EtymologyResult }) {
  const { language } = result
  const [historyId, setHistoryId] = useState(result.primaryHistoryId)
  const ngram = useNgram(result.word, language)

  // The in-app navigation flag is single-use; clear it so it can never leak
  // into a later uncached word page and auto-trace there.
  useEffect(() => {
    consumeTraceIntent(result.word, language)
  }, [result.word, language])

  const display = useMemo(
    () => ({
      ...historyEntry(result, historyId),
      ngram: ngram.status === 'ready' ? ngram.data : undefined,
    }),
    [result, ngram, historyId]
  )
  const choices = useMemo(() => historyChoices(result), [result])

  return (
    <EtymologyCard
      result={display}
      usageUnavailable={ngram.status === 'unavailable'}
      actions={<ShareButton />}
      subheader={
        <EntrySelector
          word={result.word}
          entries={choices}
          activeEntryId={historyId}
          onChange={setHistoryId}
        />
      }
    />
  )
}
