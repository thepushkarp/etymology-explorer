'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { canonicalizeWord, isValidWord } from '@/lib/validation'
import { markTraceIntent } from '@/lib/traceIntent'
import type { LanguageCode } from '@/lib/languages'
import { entryPagePath } from '@/lib/entrySelection'
import { recordRecentSearchIntent } from '@/lib/recentSearchClient'

/**
 * Programmatic in-app word navigation: mark the trace-intent flag (so an
 * uncached /word page may auto-start its live trace), then push the URL.
 * Rendered word links use <WordLink>, which does the same on click.
 */
export function useWordNavigation() {
  const router = useRouter()

  return useCallback(
    (word: string, language?: LanguageCode) => {
      const trimmed = canonicalizeWord(word)
      if (!isValidWord(trimmed)) return
      markTraceIntent(trimmed, language)
      void recordRecentSearchIntent(trimmed)
      router.push(entryPagePath(word, language))
    },
    [router]
  )
}
