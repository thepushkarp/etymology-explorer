'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { EtymologyResult, StreamEvent } from '@/lib/types'
import { useHistory } from '@/lib/hooks/useHistory'

export type StreamingState = 'idle' | 'loading' | 'success' | 'error'

const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 600

export function useStreamingEtymology() {
  const [state, setState] = useState<StreamingState>('idle')
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [partialResult, setPartialResult] = useState<EtymologyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          setState('error')
          setError(payload.error ?? 'Search failed')
          return
        }

        setPartialResult(payload.data as EtymologyResult)
        setState('success')
        addToHistory(word)
      } catch {
        if (activeRequestRef.current !== requestId) return
        setState('error')
        setError('Unable to load etymology right now')
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

      // Reset state
      setState('loading')
      setEvents([])
      setPartialResult(null)
      setError(null)

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

            // Accumulate event
            setEvents((prev) => [...prev, streamEvent])

            // Handle result event
            if (streamEvent.type === 'result') {
              setPartialResult(streamEvent.data)
              setState('success')
              addToHistory(trimmed)
              eventSource.close()
              eventSourceRef.current = null
            }

            // Handle error event
            if (streamEvent.type === 'error') {
              setState('error')
              setError(streamEvent.message)
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
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setState('idle')
    setEvents([])
    setPartialResult(null)
    setError(null)
  }, [])

  return {
    state,
    events,
    partialResult,
    error,
    search,
    reset,
  }
}
