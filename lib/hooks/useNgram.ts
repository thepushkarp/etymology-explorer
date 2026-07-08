'use client'

import { useEffect, useState } from 'react'
import type { ApiResponse, NgramResult } from '@/lib/types'

/**
 * Fetches Google Books ngram usage data for a word. Fired as soon as the
 * word is known (search start / page load) so the usage chart is ready by
 * the time the etymology card finishes rendering instead of popping in
 * afterwards. Pass null to skip fetching.
 */
export function useNgram(word: string | null): NgramResult | null {
  const [ngram, setNgram] = useState<NgramResult | null>(null)
  const trimmed = word?.trim() || null

  useEffect(() => {
    if (!trimmed) return

    const controller = new AbortController()

    fetch(`/api/ngram?word=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) return null
        return response.json() as Promise<ApiResponse<NgramResult>>
      })
      .then((payload) => {
        if (payload?.success && payload.data) {
          setNgram(payload.data)
        }
      })
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') {
          console.error('Failed to fetch ngram data:', error)
        }
      })

    return () => controller.abort()
  }, [trimmed])

  // Derived staleness guard instead of a reset-in-effect: data fetched for a
  // previous word is never surfaced for the current one.
  return ngram && ngram.word === trimmed ? ngram : null
}
