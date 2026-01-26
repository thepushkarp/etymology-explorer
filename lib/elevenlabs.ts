/**
 * ElevenLabs TTS client for pronunciation audio generation.
 * Generates natural-sounding word pronunciations on demand.
 */

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'

// Default voice: Rachel (clear, articulate - good for dictionary pronunciation)
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

/**
 * Check if ElevenLabs is configured (API key present)
 */
export function isElevenLabsConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY
}

/**
 * Generate pronunciation audio for a word using ElevenLabs TTS.
 * Returns raw audio data as ArrayBuffer (MP3 format).
 *
 * @throws Error if API call fails
 */
export async function generatePronunciation(word: string): Promise<ArrayBuffer> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID

  const response = await fetch(`${ELEVENLABS_API}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: word,
      model_id: 'eleven_turbo_v2_5', // Updated: v1 models deprecated for free tier
      voice_settings: {
        stability: 0.75,
        similarity_boost: 0.75,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`)
  }

  return response.arrayBuffer()
}
