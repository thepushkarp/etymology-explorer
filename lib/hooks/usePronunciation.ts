'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LanguageCode } from '@/lib/languages'

type PlaybackState = 'idle' | 'loading' | 'playing' | 'error'

/**
 * Plays TTS audio for a word straight from /api/pronunciation. The browser
 * streams it (playback starts before the download finishes) and the response
 * is HTTP-cached for a year, so repeat plays never refetch.
 */
export function usePronunciation(word: string, language: LanguageCode = 'en') {
  const src = `/api/pronunciation?word=${encodeURIComponent(word)}&language=${language}`
  // Keyed by src: a new word always starts idle, even if the old audio was
  // paused mid-play (pausing never fires onended).
  const [playback, setPlayback] = useState<{ src: string; state: PlaybackState }>({
    src,
    state: 'idle',
  })
  const state = playback.src === src ? playback.state : 'idle'
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(
    () => () => {
      audioRef.current?.pause()
      audioRef.current = null
    },
    [src]
  )

  const play = useCallback(async () => {
    const setState = (next: PlaybackState) => setPlayback({ src, state: next })
    let audio = audioRef.current
    if (audio && !audio.paused) return
    if (!audio) {
      audio = new Audio(src)
      audio.onended = () => setState('idle')
      audioRef.current = audio
    }
    setState('loading')
    try {
      await audio.play()
      setState('playing')
    } catch {
      audioRef.current = null
      setState('error')
    }
  }, [src])

  return {
    play,
    isLoading: state === 'loading',
    isPlaying: state === 'playing',
    error: state === 'error' ? 'Pronunciation unavailable' : null,
  }
}
