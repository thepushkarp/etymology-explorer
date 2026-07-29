'use client'

import { useEffect, useState } from 'react'
import type { ApiResponse, NgramResult } from '@/lib/types'
import type { LanguageCode } from '@/lib/languages'

export type NgramState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; data: NgramResult }
  | { status: 'unavailable'; message: string }

type KeyedNgramState = NgramState & { key: string | null }

const DEFAULT_UNAVAILABLE_MESSAGE = 'Usage history is unavailable right now.'

/**
 * Fetches Google Books ngram usage data for a word. Fired as soon as the
 * word is known (search start / page load) so the usage chart is ready by
 * the time the etymology card finishes rendering instead of popping in
 * afterwards. Pass null to skip fetching.
 */
export function useNgram(word: string | null, language: LanguageCode = 'en'): NgramState {
  const trimmed = word?.trim() || null
  const requestKey = trimmed ? `${language}:${trimmed}` : null
  const [state, setState] = useState<KeyedNgramState>({ status: 'idle', key: null })

  useEffect(() => {
    if (!trimmed) return

    const controller = new AbortController()
    const key = `${language}:${trimmed}`

    fetch(`/api/ngram?word=${encodeURIComponent(trimmed)}&language=${language}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as ApiResponse<NgramResult>
        if (response.ok && payload.success && payload.data) {
          setState({ status: 'ready', data: payload.data, key })
          return
        }

        setState({
          status: 'unavailable',
          message: payload.error ?? DEFAULT_UNAVAILABLE_MESSAGE,
          key,
        })
      })
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') {
          console.error('Failed to fetch ngram data:', error)
          setState({ status: 'unavailable', message: DEFAULT_UNAVAILABLE_MESSAGE, key })
        }
      })

    return () => controller.abort()
  }, [trimmed, language])

  // The requested identity, not merely the spelling, guards against stale
  // same-form data crossing language boundaries while a new fetch begins.
  if (!requestKey) return { status: 'idle' }
  if (state.key !== requestKey) return { status: 'loading' }
  if (state.status === 'ready') return { status: 'ready', data: state.data }
  if (state.status === 'unavailable') {
    return { status: 'unavailable', message: state.message }
  }
  return { status: state.status }
}
