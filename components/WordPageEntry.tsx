'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { EtymologyCard } from '@/components/EtymologyCard'
import { ShareMenu } from '@/components/ShareMenu'
import type { EtymologyResult } from '@/lib/types'

interface WordPageEntryProps {
  result: EtymologyResult
}

/**
 * Client shell for the server-rendered /word/[word] page.
 * Reuses the EtymologyCard presentation; word clicks route to the live
 * explorer (/?q=word) so follow-up searches keep the streaming UX.
 */
export function WordPageEntry({ result }: WordPageEntryProps) {
  const router = useRouter()

  const navigateToWord = useCallback(
    (word: string) => {
      router.push(`/?q=${encodeURIComponent(word)}`)
    },
    [router]
  )

  return (
    <EtymologyCard
      result={result}
      onWordClick={navigateToWord}
      headerActions={<ShareMenu result={result} />}
    />
  )
}
