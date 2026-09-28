'use client'

import { useEffect, useState } from 'react'
import type { ApiResponse, NgramResult } from '@/lib/types'
import type { LanguageCode } from '@/lib/languages'

export type NgramState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; data: NgramResult }
  | { status: 'unavailable' }

// One request per word per page session, shared by every consumer: the live
// trace starts it early and the finished entry reuses the same promise.
const requests = new Map<string, Promise<NgramState>>()

function loadNgram(word: string, language: LanguageCode): Promise<NgramState> {
  const key = `${language}:${word}`
  const existing = requests.get(key)
  if (existing) return existing

  const request = fetch(`/api/ngram?word=${encodeURIComponent(word)}&language=${language}`)
    .then(async (response): Promise<NgramState> => {
      const payload = (await response.json()) as ApiResponse<NgramResult>
      return response.ok && payload.success && payload.data
        ? { status: 'ready', data: payload.data }
        : { status: 'unavailable' }
    })
    .catch((): NgramState => {
      requests.delete(key) // network failure: allow a later retry
      return { status: 'unavailable' }
    })
  requests.set(key, request)
  return request
}

/** Google Books usage data for a word; pass null to skip fetching. */
export function useNgram(word: string | null, language: LanguageCode = 'en'): NgramState {
  const key = word ? `${language}:${word}` : null
  const [state, setState] = useState<{ key: string | null; value: NgramState }>({
    key: null,
    value: { status: 'idle' },
  })

  useEffect(() => {
    if (!word) return
    let active = true
    loadNgram(word, language).then((value) => {
      if (active) setState({ key: `${language}:${word}`, value })
    })
    return () => {
      active = false
    }
  }, [word, language])

  if (!key) return { status: 'idle' }
  return state.key === key ? state.value : { status: 'loading' }
}
