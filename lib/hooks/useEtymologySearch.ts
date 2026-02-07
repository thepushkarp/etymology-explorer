import { useState, useCallback } from 'react'
import { EtymologyResult, WordSuggestion } from '@/lib/types'
import { useHistory } from '@/lib/hooks/useHistory'

export type AppState = 'idle' | 'loading' | 'success' | 'error'
export type ErrorType = 'nonsense' | 'network-error' | 'typo' | 'rate-limit'

export interface ErrorInfo {
  type: ErrorType
  message: string
  suggestions: WordSuggestion[]
}

export function useEtymologySearch() {
  const [state, setState] = useState<AppState>('idle')
  const [result, setResult] = useState<EtymologyResult | null>(null)
  const [error, setError] = useState<ErrorInfo | null>(null)

  const { addToHistory } = useHistory()

  const searchWord = useCallback(
    async (word: string) => {
      const trimmed = word.trim().toLowerCase()
      if (!trimmed) return

      setState('loading')
      setResult(null)
      setError(null)

      try {
        const response = await fetch('/api/etymology', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word: trimmed }),
        })

        const data = await response.json()

        if (data.success && data.data) {
          setState('success')
          setResult(data.data)
          addToHistory(trimmed)
          return
        }

        const suggestions =
          data?.data?.suggestions && Array.isArray(data.data.suggestions)
            ? (data.data.suggestions as string[]).map((wordSuggestion) => ({
                word: wordSuggestion,
                distance: 0,
              }))
            : []

        setState('error')
        setError({
          type:
            response.status === 429 || response.status === 403
              ? 'rate-limit'
              : suggestions.length > 0
                ? 'typo'
                : 'nonsense',
          message: data.error || "That doesn't appear to be a word we recognize.",
          suggestions,
        })
      } catch (err) {
        console.error('Search failed:', err)
        setState('error')
        setError({
          type: 'network-error',
          message: 'Something went awry in the ether...',
          suggestions: [],
        })
      }
    },
    [addToHistory]
  )

  return {
    state,
    result,
    error,
    searchWord,
    resetState: () => {
      setState('idle')
      setResult(null)
      setError(null)
    },
  }
}
