'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LanguageCode } from '@/lib/languages'
import { PRONUNCIATION_REVISION } from '@/lib/pronunciation'

type PlaybackState = 'idle' | 'loading' | 'playing' | 'error'

/**
 * Plays TTS audio for a word straight from /api/pronunciation. The browser
 * streams it (playback starts before the download finishes) and the response
 * is HTTP-cached for a year, so repeat plays never refetch.
 */
export function usePronunciation(word: string, language: LanguageCode = 'en', ipa?: string) {
  const src = `/api/pronunciation?word=${encodeURIComponent(word)}&language=${language}&v=${PRONUNCIATION_REVISION}${ipa ? `&ipa=${encodeURIComponent(ipa)}` : ''}`
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
      const audio = audioRef.current
      audioRef.current = null
      if (audio) {
        audio.onended = null
        audio.onerror = null
        audio.pause()
      }
    },
    [src]
  )

  const play = useCallback(async () => {
    const setState = (next: PlaybackState) => setPlayback({ src, state: next })
    let audio = audioRef.current
    if (audio && !audio.paused) return
    if (!audio) {
      audio = new Audio(src)
      const element = audio
      audio.onended = () => {
        if (audioRef.current === element) setState('idle')
      }
      // Network or decode failures mid-playback never fire onended; allow a retry.
      audio.onerror = () => {
        if (audioRef.current !== element) return
        audioRef.current = null
        setState('error')
      }
      audioRef.current = audio
    }
    setState('loading')
    try {
      await audio.play()
      if (audioRef.current === audio) setState('playing')
    } catch {
      if (audioRef.current !== audio) return
      audioRef.current = null
      audio.pause()
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
