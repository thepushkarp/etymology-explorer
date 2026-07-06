'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Fetches TTS audio for a word from /api/pronunciation and plays it.
 * The fetched audio is reused for repeat plays and discarded when the word changes.
 */
export function usePronunciation(word: string) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const loadedWordRef = useRef<string | null>(null)

  const play = useCallback(async () => {
    if (!word.trim()) return

    setError(null)

    // Discard cached audio from a previous word
    if (loadedWordRef.current !== word && audioRef.current) {
      audioRef.current = null
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }

    // Audio already loaded - just play
    if (audioRef.current) {
      setIsPlaying(true)
      try {
        await audioRef.current.play()
      } catch {
        setError('Playback failed')
        setIsPlaying(false)
      }
      return
    }

    // Fetch and play
    setIsLoading(true)
    try {
      const response = await fetch(`/api/pronunciation?word=${encodeURIComponent(word)}`)

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url

      const audio = new Audio(url)
      audio.onended = () => setIsPlaying(false)
      audio.onerror = () => {
        setError('Playback failed')
        setIsPlaying(false)
      }

      audioRef.current = audio
      loadedWordRef.current = word
      setIsPlaying(true)
      await audio.play()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load'
      setError(message)
      console.error('[usePronunciation] Error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [word])

  return { play, isPlaying, isLoading, error }
}
