/**
 * ElevenLabs TTS client for pronunciation audio generation.
 * Generates natural-sounding word pronunciations on demand.
 */

import { fetchWithTimeout } from './fetchUtils'
import { CONFIG } from './config'

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128'

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
export function isElevenLabsConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY && !!process.env.ELEVENLABS_VOICE_ID
}

/**
 * Generate pronunciation audio for a word using ElevenLabs TTS.
 * Returns raw audio data as ArrayBuffer (MP3 format).
 *
 * @throws Error if API call fails
 */
export async function generatePronunciation(word: string): Promise<ArrayBuffer> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID
  if (!voiceId) {
    throw new Error('ELEVENLABS_VOICE_ID is required for pronunciation audio')
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
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75,
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
