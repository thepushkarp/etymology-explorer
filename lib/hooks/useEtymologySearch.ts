import { useState, useCallback } from 'react'
import { EtymologyResult, WordSuggestion } from '@/lib/types'
import { useHistory } from '@/lib/hooks/useHistory'
import { getChallengeToken, isTurnstileClientConfigured } from '@/lib/challenge-client'

export type AppState = 'idle' | 'loading' | 'success' | 'error'
export type ErrorType = 'nonsense' | 'network-error' | 'typo' | 'rate-limit'

export interface ErrorInfo {
  type: ErrorType
  message: string
  suggestions: WordSuggestion[]
}

interface SearchErrorData {
  suggestions?: string[]
  errorCode?: string
}

interface SearchResponseBody {
  success?: boolean
  data?: EtymologyResult | SearchErrorData
  error?: string
}

async function parseResponseBody(response: Response): Promise<SearchResponseBody> {
  try {
    return (await response.json()) as SearchResponseBody
  } catch {
    return {}
  }
}

async function requestEtymology(
  word: string,
  challengeToken?: string
): Promise<{ response: Response; data: SearchResponseBody }> {
  const body: { word: string; challengeToken?: string } = { word }
  if (challengeToken) {
    body.challengeToken = challengeToken
  }

  const response = await fetch('/api/etymology', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await parseResponseBody(response)
  return { response, data }
}

function extractSuggestions(data: SearchResponseBody): WordSuggestion[] {
  const maybeSuggestions = (data.data as SearchErrorData | undefined)?.suggestions
  if (!Array.isArray(maybeSuggestions)) {
    return []
  }

  return maybeSuggestions.map((wordSuggestion) => ({
    word: wordSuggestion,
    distance: 0,
  }))
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
        let { response, data } = await requestEtymology(trimmed)

        const errorCode = (data.data as SearchErrorData | undefined)?.errorCode
        if (response.status === 403 && errorCode === 'challenge_required' && isTurnstileClientConfigured()) {
          const challengeToken = await getChallengeToken()
          if (challengeToken) {
            const retried = await requestEtymology(trimmed, challengeToken)
            response = retried.response
            data = retried.data
          }
        }

        if (data.success && data.data) {
          setState('success')
          setResult(data.data as EtymologyResult)
          addToHistory(trimmed)
          return
        }

        const suggestions = extractSuggestions(data)

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
