'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useHistory } from '@/lib/hooks/useHistory'
import { markTraceIntent, wordPagePath } from '@/lib/traceIntent'

/**
 * All in-app word navigation funnels through here: mark the trace-intent
 * flag (so an uncached /word page may auto-start its live trace), then
 * push the canonical /word/{word} URL. Also provides keyboard history
 * navigation relative to the currently viewed word (null on the landing).
 */
export function useWordNavigation(currentWord: string | null = null) {
  const router = useRouter()
  const { history } = useHistory()

  const navigateToWord = useCallback(
    (word: string) => {
      const trimmed = word.trim()
      if (!trimmed) return
      markTraceIntent(trimmed)
      router.push(wordPagePath(trimmed))
    },
    [router]
  )

  const historyBack = useCallback(() => {
    if (history.length === 0) return

    if (!currentWord) {
      navigateToWord(history[0].word)
      return
    }

    const currentIndex = history.findIndex((entry) => entry.word === currentWord)
    if (currentIndex === -1) {
      navigateToWord(history[0].word)
      return
    }

    const nextIndex = Math.min(currentIndex + 1, history.length - 1)
    if (nextIndex === currentIndex) return
    navigateToWord(history[nextIndex].word)
  }, [history, currentWord, navigateToWord])

  const historyForward = useCallback(() => {
    if (!currentWord || history.length === 0) return

    const currentIndex = history.findIndex((entry) => entry.word === currentWord)
    if (currentIndex <= 0) return

    navigateToWord(history[currentIndex - 1].word)
  }, [history, currentWord, navigateToWord])

  return { navigateToWord, historyBack, historyForward }
}
