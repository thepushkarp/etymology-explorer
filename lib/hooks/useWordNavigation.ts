'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { canonicalizeWord, isValidWord } from '@/lib/validation'
import { markTraceIntent } from '@/lib/traceIntent'
import { wordPagePath, type LanguageCode } from '@/lib/languages'

/**
 * Programmatic in-app word navigation: mark the trace-intent flag (so an
 * uncached /word page may auto-start its live trace), then push the URL.
 * Rendered word links use <WordLink>, which does the same on click.
 */
export function useWordNavigation() {
  const router = useRouter()

  return useCallback(
    (word: string, language: LanguageCode = 'en') => {
      const trimmed = canonicalizeWord(word)
      if (!isValidWord(trimmed)) return
      markTraceIntent(trimmed, language)
      router.push(wordPagePath(trimmed, language))
    },
    [router]
  )
}
