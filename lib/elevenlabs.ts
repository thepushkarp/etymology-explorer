/**
 * ElevenLabs TTS client for pronunciation audio generation.
 * Generates natural-sounding word pronunciations on demand.
 */

import { fetchWithTimeout } from './fetchUtils'
import { CONFIG } from './config'
import type { LanguageCode } from './languages'
import { createHash } from 'node:crypto'

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128'
const MODEL_ID = 'eleven_v3'

export function getElevenLabsVoiceId(language: LanguageCode): string | undefined {
  return language === 'ja'
    ? process.env.ELEVENLABS_JAPANESE_VOICE_ID
    : process.env.ELEVENLABS_VOICE_ID
}

export function getPronunciationCacheIdentity(
  text: string,
  language: LanguageCode
): string | undefined {
  if (language !== 'ja') return undefined
  const voiceId = getElevenLabsVoiceId(language)
  if (!voiceId) return undefined
  const readingHash = createHash('sha256').update(text.normalize('NFKC')).digest('hex').slice(0, 24)
  return `ja:${voiceId}:${MODEL_ID}:${readingHash}`
}

export class ElevenLabsApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ElevenLabsApiError'
    this.status = status
  }
}

async function readElevenLabsError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: { message?: string }
      message?: string
      error?: string
    } | null

    return (
      payload?.detail?.message ??
      payload?.message ??
      payload?.error ??
      `ElevenLabs API error: ${response.status}`
    )
  }

  const text = await response.text().catch(() => '')
  return text || `ElevenLabs API error: ${response.status}`
}

/**
 * Check if ElevenLabs is configured (API key + voice ID present)
 */
export function isElevenLabsConfigured(language: LanguageCode = 'en'): boolean {
  return !!process.env.ELEVENLABS_API_KEY && !!getElevenLabsVoiceId(language)
}

/**
 * Generate pronunciation audio for a word using ElevenLabs TTS.
 * Returns raw audio data as ArrayBuffer (MP3 format).
 *
 * @throws Error if API call fails
 */
export async function generatePronunciation(
  word: string,
  language: LanguageCode = 'en'
): Promise<ArrayBuffer> {
  const voiceId = getElevenLabsVoiceId(language)
  if (!voiceId) {
    throw new Error(
      `${language === 'ja' ? 'ELEVENLABS_JAPANESE_VOICE_ID' : 'ELEVENLABS_VOICE_ID'} is required for pronunciation audio`
    )
  }

  const response = await fetchWithTimeout(
    `${ELEVENLABS_API}/text-to-speech/${voiceId}?output_format=${DEFAULT_OUTPUT_FORMAT}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: word,
        model_id: MODEL_ID,
        // This selects language and text normalization. The configured voice
        // still determines accent; pt intentionally does not imply BR or PT.
        language_code: language,
        ...(language === 'ja' ? { apply_language_text_normalization: true } : {}),
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          use_speaker_boost: true,
        },
      }),
    },
    CONFIG.timeouts.tts
  )

  if (!response.ok) {
    const errorText = await readElevenLabsError(response)
    throw new ElevenLabsApiError(errorText, response.status)
  }

  return response.arrayBuffer()
}
