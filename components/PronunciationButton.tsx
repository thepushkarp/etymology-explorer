'use client'

import { SpeakerIcon } from '@/components/Icons'
import { useHotkey } from '@/lib/hooks/useHotkey'
import { usePronunciation } from '@/lib/hooks/usePronunciation'
import { LANGUAGES, languageFromName, type LanguageCode } from '@/lib/languages'

/** Plays TTS audio for the word; `p` plays it from anywhere on the page. */
export function PronunciationButton({ word, language }: { word: string; language: LanguageCode }) {
  const { play, isPlaying, isLoading, error } = usePronunciation(word, language)
  const speechLanguage = LANGUAGES[language].ttsLanguageCode
  const supported = Boolean(speechLanguage)
  const speechCode = languageFromName(speechLanguage ?? '')
  const reading =
    speechCode && speechCode !== language
      ? `${LANGUAGES[speechCode].englishName} reading`
      : 'pronunciation'
  useHotkey('p', () => {
    if (supported) void play()
  })
  if (!supported) return null

  return (
    <button
      type="button"
      onClick={play}
      disabled={isLoading || isPlaying}
      aria-label={`Play ${reading} of ${word}`}
      title={error ?? (reading === 'pronunciation' ? 'Listen (p)' : `Listen to ${reading} (p)`)}
      className={`-m-1 p-1 transition-colors disabled:cursor-default ${
        error ? 'text-accent' : isPlaying ? 'text-ink' : 'text-muted hover:text-ink'
      } ${isLoading ? 'animate-pulse' : ''}`}
    >
      <SpeakerIcon
        className={isPlaying ? 'scale-110 transition-transform' : 'transition-transform'}
      />
    </button>
  )
}
