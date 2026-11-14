'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { canonicalizeWord, isValidWord } from '@/lib/validation'
import { StreamEvent, type WordEntry } from '@/lib/types'
import { initialStreamState, streamReducer } from '@/lib/streamReducer'
import { wordPagePath, type LanguageCode } from '@/lib/languages'
import { normalizeScriptTargets } from '@/lib/scriptTargets'
import { recordRecentSearchIntent } from '@/lib/recentSearchClient'
import { rememberCompletedEntry } from '@/lib/completedEntries'
import { toStreamingUiError } from '@/lib/streamingError'

const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 600

function finishEntry(
  word: string,
  result: WordEntry,
  hint?: LanguageCode,
  resolvedLanguage?: LanguageCode
): void {
  rememberCompletedEntry(result, word, hint)
  if (
    result.word !== word &&
    [wordPagePath(word), wordPagePath(word, hint)].includes(window.location.pathname)
  ) {
    const preferred = resolvedLanguage ?? hint
    const language = preferred && result.entries[preferred] ? preferred : result.languages[0]
    window.history.replaceState(
      null,
      '',
      `${wordPagePath(result.word, language)}${window.location.search}`
    )
  }
  void recordRecentSearchIntent(result.word)
}

/**
 * Streaming etymology search over SSE. All progress state lives in the pure
 * reducer (lib/streamReducer.ts); this hook owns only the transport: the
 * EventSource lifecycle, reconnection with backoff, and the non-streaming
 * fallback fetch.
 */
export function useStreamingEtymology(defaultHint?: LanguageCode, routeWord?: string) {
  const [progress, dispatch] = useReducer(streamReducer, initialStreamState)

  const eventSourceRef = useRef<EventSource | null>(null)
  const fallbackControllerRef = useRef<AbortController | null>(null)
  const activeRequestRef = useRef(0)
  const completedRequestRef = useRef<number | null>(null)

  const fallbackFetch = useCallback(
    async (word: string, requestId: number, url: string, hint?: LanguageCode) => {
      try {
        const controller = new AbortController()
        fallbackControllerRef.current = controller
        const response = await fetch(url, { signal: controller.signal })
        const payload = await response.json()

        if (activeRequestRef.current !== requestId || completedRequestRef.current === requestId)
          return

        if (payload.lookupResolution)
          dispatch({
            type: 'stream_event',
            event: { type: 'lookup_resolution', resolution: payload.lookupResolution },
          })

        if (!response.ok || !payload.success || !payload.data) {
          completedRequestRef.current = requestId
          const otherScripts = normalizeScriptTargets(payload.data?.otherScripts)
          dispatch({
            type: 'fallback_error',
            error: toStreamingUiError({
              type: 'error',
              errorType: payload.errorType ?? 'network',
              message: payload.error ?? 'Search failed',
              suggestions: Array.isArray(payload.data?.suggestions)
                ? payload.data.suggestions.filter((word: unknown) => typeof word === 'string')
                : [],
              ...(otherScripts.length ? { otherScripts } : {}),
            }),
          })
          return
        }

        dispatch({ type: 'fallback_success', result: payload.data })
        completedRequestRef.current = requestId
        finishEntry(
          routeWord ?? word,
          payload.data,
          hint,
          payload.lookupResolution?.selected?.language
        )
      } catch {
        if (activeRequestRef.current !== requestId || completedRequestRef.current === requestId)
          return
        completedRequestRef.current = requestId
        dispatch({
          type: 'fallback_error',
          error: {
            type: 'network-error',
            message: 'Unable to load etymology right now',
            suggestions: [],
          },
        })
      }
    },
    [routeWord]
  )

  useEffect(() => {
    return () => {
      // Prevent pending backoff timers and fallback responses from reviving a
      // request after this hook has unmounted.
      activeRequestRef.current += 1
      fallbackControllerRef.current?.abort()
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [defaultHint])

  const search = useCallback(
    (
      word: string,
      hint: LanguageCode | undefined = defaultHint,
      options?: { refresh?: boolean }
    ) => {
      const trimmed = canonicalizeWord(word)
      if (!isValidWord(trimmed)) return

      const requestId = activeRequestRef.current + 1
      activeRequestRef.current = requestId

      fallbackControllerRef.current?.abort()
      dispatch({ type: 'search_started', word: trimmed })
      const params = new URLSearchParams({ word: trimmed })
      if (hint) params.set('language', hint)
      if (options?.refresh) params.set('refresh', '1')
      const fallbackUrl = `/api/etymology?${params}`
      let resolvedLanguage = hint

      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      const transportFailed = (attempt: number, source?: EventSource) => {
        if (
          activeRequestRef.current !== requestId ||
          completedRequestRef.current === requestId ||
          (source && eventSourceRef.current !== source)
        )
          return
        source?.close()
        eventSourceRef.current = null
        // A partial refresh remains stale. Reconnecting could spend again after
        // the server saved it but the terminal SSE event failed to reach us.
        if (options?.refresh) {
          completedRequestRef.current = requestId
          dispatch({
            type: 'fallback_error',
            error: {
              type: 'network-error',
              message: 'Retrace interrupted. Your saved entry is still available.',
              suggestions: [],
            },
          })
        } else if (source && attempt < MAX_RETRIES) {
          window.setTimeout(() => connect(attempt + 1), RETRY_BASE_DELAY_MS * Math.pow(2, attempt))
        } else {
          void fallbackFetch(trimmed, requestId, fallbackUrl, hint)
        }
      }

      const connect = (attempt: number) => {
        if (activeRequestRef.current !== requestId || completedRequestRef.current === requestId)
          return

        // Each connection observes a new server session with its own source job IDs.
        if (attempt > 0) dispatch({ type: 'stream_reconnecting' })
        const url = `${fallbackUrl}&stream=true`
        let eventSource: EventSource
        try {
          eventSource = new EventSource(url)
        } catch {
          transportFailed(attempt)
          return
        }
        eventSourceRef.current = eventSource

        eventSource.addEventListener('message', (event) => {
          if (
            activeRequestRef.current !== requestId ||
            completedRequestRef.current === requestId ||
            eventSourceRef.current !== eventSource
          ) {
            return
          }

          try {
            const streamEvent: StreamEvent = JSON.parse(event.data)
            if (streamEvent.type === 'entry_identity') resolvedLanguage = streamEvent.language

            dispatch({ type: 'stream_event', event: streamEvent })

            if (streamEvent.type === 'result' || streamEvent.type === 'error') {
              completedRequestRef.current = requestId
              eventSource.close()
              eventSourceRef.current = null
              if (streamEvent.type === 'result') {
                finishEntry(routeWord ?? trimmed, streamEvent.data, hint, resolvedLanguage)
              }
            }
          } catch {
            transportFailed(attempt, eventSource)
          }
        })
        eventSource.addEventListener('error', () => transportFailed(attempt, eventSource))
      }

      connect(0)
    },
    [fallbackFetch, defaultHint, routeWord]
  )

  return {
    progress,
    search,
  }
}
