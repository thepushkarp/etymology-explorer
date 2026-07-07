'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { StreamEvent } from '@/lib/types'
import { useHistory } from '@/lib/hooks/useHistory'
import { initialStreamState, streamReducer } from '@/lib/streamReducer'

const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 600

/**
 * Streaming etymology search over SSE. All progress state lives in the pure
 * reducer (lib/streamReducer.ts); this hook owns only the transport: the
 * EventSource lifecycle, reconnection with backoff, and the non-streaming
 * fallback fetch.
 */
export function useStreamingEtymology() {
  const [progress, dispatch] = useReducer(streamReducer, initialStreamState)

  const eventSourceRef = useRef<EventSource | null>(null)
  const activeRequestRef = useRef(0)
  const { addToHistory } = useHistory()

  const fallbackFetch = useCallback(
    async (word: string, requestId: number) => {
      try {
        const response = await fetch(`/api/etymology?word=${encodeURIComponent(word)}`)
        const payload = await response.json()

        if (activeRequestRef.current !== requestId) return

        if (!response.ok || !payload.success || !payload.data) {
          dispatch({
            type: 'fallback_error',
            error: {
              type: 'network-error',
              message: payload.error ?? 'Search failed',
              suggestions: [],
            },
          })
          return
        }

        dispatch({ type: 'fallback_success', result: payload.data })
        addToHistory(word)
      } catch {
        if (activeRequestRef.current !== requestId) return
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
    [addToHistory]
  )

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  const search = useCallback(
    (word: string) => {
      const trimmed = word.trim().toLowerCase()
      if (!trimmed) return

      const requestId = activeRequestRef.current + 1
      activeRequestRef.current = requestId

      dispatch({ type: 'search_started' })

      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      const connect = (attempt: number) => {
        if (activeRequestRef.current !== requestId) return

        const url = `/api/etymology?word=${encodeURIComponent(trimmed)}&stream=true`
        const eventSource = new EventSource(url)
        eventSourceRef.current = eventSource

        eventSource.addEventListener('message', (event) => {
          if (activeRequestRef.current !== requestId) return

          try {
            const streamEvent: StreamEvent = JSON.parse(event.data)

            dispatch({ type: 'stream_event', event: streamEvent })

            if (streamEvent.type === 'result') {
              addToHistory(trimmed)
              eventSource.close()
              eventSourceRef.current = null
            }

            if (streamEvent.type === 'error') {
              eventSource.close()
              eventSourceRef.current = null
            }
          } catch {
            if (activeRequestRef.current !== requestId) return

            if (attempt < MAX_RETRIES) {
              eventSource.close()
              const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
              window.setTimeout(() => {
                connect(attempt + 1)
              }, delay)
              return
            }

            eventSource.close()
            eventSourceRef.current = null
            void fallbackFetch(trimmed, requestId)
          }
        })

        eventSource.addEventListener('error', () => {
          if (activeRequestRef.current !== requestId) return

          eventSource.close()
          eventSourceRef.current = null

          if (attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
            window.setTimeout(() => {
              connect(attempt + 1)
            }, delay)
            return
          }

          void fallbackFetch(trimmed, requestId)
        })
      }

      try {
        connect(0)
      } catch {
        void fallbackFetch(trimmed, requestId)
      }
    },
    [addToHistory, fallbackFetch]
  )

  const reset = useCallback(() => {
    activeRequestRef.current += 1
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    dispatch({ type: 'reset' })
  }, [])

  return {
    progress,
    search,
    reset,
  }
}
