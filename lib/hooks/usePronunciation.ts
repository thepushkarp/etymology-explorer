'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LanguageCode } from '@/lib/languages'

/**
 * Fetches TTS audio for a word from /api/pronunciation and plays it.
 * The fetched audio is reused for repeat plays and discarded when the word
 * changes. Concurrent play() calls are ignored while audio is loading or
 * playing, and a response that arrives after the word changed is dropped.
 */
export function usePronunciation(word: string, language: LanguageCode = 'en') {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const loadedWordRef = useRef<string | null>(null)
  const activeWordRef = useRef(`${language}:${word}`)
  const busyRef = useRef(false)

  const lexeme = `${language}:${word}`
  activeWordRef.current = lexeme

  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    },
    []
  )

  const play = useCallback(async () => {
    if (!word.trim() || busyRef.current) return

    setError(null)

    // Discard cached audio from a previous word
    if (loadedWordRef.current !== lexeme && audioRef.current) {
      audioRef.current = null
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }

    // Audio already loaded - just play
    if (audioRef.current) {
      busyRef.current = true
      setIsPlaying(true)
      try {
        await audioRef.current.play()
      } catch {
        setError('Playback failed')
        setIsPlaying(false)
        busyRef.current = false
      }
      return
    }

    // Fetch and play
    busyRef.current = true
    setIsLoading(true)
    try {
      const response = await fetch(
        `/api/pronunciation?word=${encodeURIComponent(word)}&language=${language}`
      )

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${response.status}`)
      }

      const blob = await response.blob()

      // The searched word changed while fetching - drop the stale audio
      if (activeWordRef.current !== lexeme) {
        busyRef.current = false
        return
      }

      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url

      const audio = new Audio(url)
      audio.onended = () => {
        setIsPlaying(false)
        busyRef.current = false
      }
      audio.onerror = () => {
        setError('Playback failed')
        setIsPlaying(false)
        busyRef.current = false
      }

      audioRef.current = audio
      loadedWordRef.current = lexeme
      setIsPlaying(true)
      await audio.play()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load'
      setError(message)
      setIsPlaying(false)
      busyRef.current = false
      console.error('[usePronunciation] Error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [word, language, lexeme])

  return { play, isPlaying, isLoading, error }
}
