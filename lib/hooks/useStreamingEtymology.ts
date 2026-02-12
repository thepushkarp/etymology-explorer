'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { EtymologyResult, StreamEvent } from '@/lib/types'
import { useHistory } from '@/lib/hooks/useHistory'

export type StreamingState = 'idle' | 'loading' | 'success' | 'error'

export function useStreamingEtymology() {
  const [state, setState] = useState<StreamingState>('idle')
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [partialResult, setPartialResult] = useState<EtymologyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const { addToHistory } = useHistory()

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

      // Reset state
      setState('loading')
      setEvents([])
      setPartialResult(null)
      setError(null)

      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      try {
        const url = `/api/etymology?word=${encodeURIComponent(trimmed)}&stream=true`
        const eventSource = new EventSource(url)
        eventSourceRef.current = eventSource

        eventSource.addEventListener('message', (event) => {
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
          } catch (parseErr) {
            console.error('Failed to parse SSE message:', parseErr)
            setState('error')
            setError('Failed to parse server response')
            eventSource.close()
            eventSourceRef.current = null
          }
        })

        eventSource.addEventListener('error', () => {
          console.error('EventSource error')
          setState('error')
          setError('Connection lost')
          eventSource.close()
          eventSourceRef.current = null
        })
      } catch (err) {
        console.error('Failed to create EventSource:', err)
        setState('error')
        setError('Failed to connect to server')
      }
    },
    [addToHistory]
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
