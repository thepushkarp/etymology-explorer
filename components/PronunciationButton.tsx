'use client'

import { useState, useRef, useCallback } from 'react'
import { getChallengeToken, isTurnstileClientConfigured } from '@/lib/challenge-client'

interface PronunciationButtonProps {
  word: string
  className?: string
}

interface PronunciationErrorBody {
  error?: string
  data?: {
    errorCode?: string
  }
}

/**
 * Audio playback button for word pronunciation.
 * Fetches audio on-demand from ElevenLabs TTS API and caches locally.
 */
export function PronunciationButton({ word, className = '' }: PronunciationButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const play = useCallback(async () => {
    setError(null)

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
      const fetchPronunciation = async (challengeToken?: string): Promise<Response> => {
        const params = new URLSearchParams({ word })
        if (challengeToken) {
          params.set('challengeToken', challengeToken)
        }
        return fetch(`/api/pronunciation?${params.toString()}`)
      }

      let response = await fetchPronunciation()
      if (response.status === 403 && isTurnstileClientConfigured()) {
        const body = (await response.clone().json().catch(() => ({}))) as PronunciationErrorBody
        if (body.data?.errorCode === 'challenge_required') {
          const challengeToken = await getChallengeToken()
          if (challengeToken) {
            response = await fetchPronunciation(challengeToken)
          }
        }
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as PronunciationErrorBody
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
      setIsPlaying(true)
      await audio.play()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load'
      setError(message)
      console.error('[PronunciationButton] Error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [word])

  // Cleanup object URL on unmount is handled by browser garbage collection
  // when the audio element is dereferenced

  return (
    <button
      onClick={play}
      disabled={isLoading || isPlaying}
      aria-label={`Play pronunciation of ${word}`}
      title={error || 'Listen to pronunciation'}
      className={`
        inline-flex items-center justify-center
        w-7 h-7
        rounded-full
        transition-all duration-200
        ${
          error
            ? 'text-red-500/70 hover:text-red-500 hover:bg-red-50'
            : 'text-charcoal/40 hover:text-charcoal/70 hover:bg-charcoal/5'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {isLoading ? (
        <LoadingIcon />
      ) : isPlaying ? (
        <PlayingIcon />
      ) : error ? (
        <ErrorIcon />
      ) : (
        <SpeakerIcon />
      )}
    </button>
  )
}

function LoadingIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function PlayingIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      {/* Sound wave animation effect */}
      <rect x="4" y="8" width="3" height="8" rx="1" className="animate-pulse" />
      <rect
        x="10"
        y="5"
        width="3"
        height="14"
        rx="1"
        className="animate-pulse"
        style={{ animationDelay: '0.1s' }}
      />
      <rect
        x="16"
        y="8"
        width="3"
        height="8"
        rx="1"
        className="animate-pulse"
        style={{ animationDelay: '0.2s' }}
      />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      {/* Speaker/volume icon */}
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path
        d="M15.54 8.46a5 5 0 0 1 0 7.07"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M19.07 4.93a10 10 0 0 1 0 14.14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
