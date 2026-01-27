import { useState, useCallback } from 'react'
import { EtymologyResult, WordSuggestion, LLMConfig } from '@/lib/types'
import { useHistory } from '@/lib/hooks/useHistory'

export type AppState = 'idle' | 'loading' | 'success' | 'error'
export type ErrorType = 'nonsense' | 'no-api-key' | 'network-error' | 'typo'

export interface ErrorInfo {
  type: ErrorType
  message: string
  suggestions: WordSuggestion[]
}

export function useEtymologySearch(llmConfig: LLMConfig) {
  const [state, setState] = useState<AppState>('idle')
  const [result, setResult] = useState<EtymologyResult | null>(null)
  const [error, setError] = useState<ErrorInfo | null>(null)

  const { addToHistory } = useHistory()

  const searchWord = useCallback(
    async (word: string) => {
      const trimmed = word.trim().toLowerCase()
      if (!trimmed) return

      // Check for valid LLM config
      const isConfigValid =
        llmConfig.provider === 'anthropic'
          ? llmConfig.anthropicApiKey.length > 0
          : llmConfig.openrouterApiKey.length > 0 && llmConfig.openrouterModel.length > 0

      if (!isConfigValid) {
        setState('error')
        setError({
          type: 'no-api-key',
          message:
            llmConfig.provider === 'anthropic'
              ? "You'll need an Anthropic API key to explore etymologies."
              : "You'll need to configure OpenRouter with an API key and model.",
          suggestions: [],
        })
        return
      }

      setState('loading')
      setResult(null)
      setError(null)

      try {
        const response = await fetch('/api/etymology', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word: trimmed, llmConfig }),
        })

        const data = await response.json()

        if (data.success && data.data) {
          setState('success')
          setResult(data.data)
          addToHistory(trimmed)
        } else if (data.suggestions && data.suggestions.length > 0) {
          // Typo detected - show suggestions
          setState('error')
          setError({
            type: 'typo',
            message: `We couldn't find "${trimmed}" in our lexicon.`,
            suggestions: data.suggestions,
          })
        } else {
          // Nonsense word
          setState('error')
          setError({
            type: 'nonsense',
            message: data.error || "That doesn't appear to be a word we recognize.",
            suggestions: [],
          })
        }
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
    [llmConfig, addToHistory]
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
