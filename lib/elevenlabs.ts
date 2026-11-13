/** ElevenLabs TTS client for word pronunciation audio. */

import { z } from 'zod'
import { fetchWithTimeout } from './fetchUtils'
import { CONFIG } from './config'
import { LANGUAGES, type LanguageCode } from './languages'

const ELEVENLABS_ORIGIN = 'https://api.elevenlabs.io'
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128'
const VOICE_UNAVAILABLE: Record<string, readonly number[]> = {
  voice_not_found: [400, 404],
  invalid_voice_id: [400],
  voice_access_denied: [403],
}
const StockVoiceCatalog = z.object({
  voices: z.array(
    z.object({
      voice_id: z.string().min(1),
      category: z.string().nullish(),
      labels: z.record(z.string(), z.string()).nullish(),
      verified_languages: z.array(z.object({ language: z.string() })).nullish(),
      high_quality_base_model_ids: z.array(z.string()).nullish(),
    })
  ),
  has_more: z.boolean(),
})

export class ElevenLabsApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
    this.name = 'ElevenLabsApiError'
  }
}

async function readElevenLabsError(response: Response): Promise<ElevenLabsApiError> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as {
      detail?: { code?: string; status?: string; message?: string }
      message?: string
      error?: string
    } | null
    return new ElevenLabsApiError(
      payload?.detail?.message ??
        payload?.message ??
        payload?.error ??
        `ElevenLabs API error: ${response.status}`,
      response.status,
      payload?.detail?.code ?? payload?.detail?.status
    )
  }
  return new ElevenLabsApiError(
    (await response.text()) || `ElevenLabs API error: ${response.status}`,
    response.status
  )
}

/** Voice selection comes from the account's default female catalog. */
export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY)
}

async function stockVoices(language: string): Promise<string[]> {
  const query = new URLSearchParams({
    voice_type: 'default',
    gender: 'female',
    page_size: '100',
    sort: 'name',
    sort_direction: 'asc',
    include_total_count: 'false',
  })
  const response = await fetchWithTimeout(
    `${ELEVENLABS_ORIGIN}/v2/voices?${query}`,
    { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! } },
    CONFIG.timeouts.source
  )
  if (!response.ok) throw await readElevenLabsError(response)
  const catalog = StockVoiceCatalog.parse(await response.json())
  if (catalog.has_more) throw new Error('ElevenLabs stock voice catalog exceeds 100 voices')
  const rank = (voice: (typeof catalog.voices)[number]) =>
    voice.labels?.language === language
      ? 2
      : voice.verified_languages?.some((verified) => verified.language === language)
        ? 1
        : 0
  const voices = catalog.voices
    .filter(
      (candidate) =>
        candidate.labels?.gender === 'female' &&
        (rank(candidate) > 0 ||
          candidate.high_quality_base_model_ids?.some((model) =>
            /multilingual|^eleven_v[34](?:_|$)/.test(model)
          ))
    )
    .sort((left, right) => rank(right) - rank(left))
  if (!voices.length)
    throw new Error(`No available default female voice for speech language ${language}`)
  return voices.map((voice) => voice.voice_id)
}

/** Generate one clip, with at most one alternate voice for a voice-specific failure. */
export async function generatePronunciation(
  word: string,
  language: LanguageCode = 'en',
  ipa?: string
): Promise<ArrayBuffer> {
  const languageCode = LANGUAGES[language].ttsLanguageCode
  if (!languageCode)
    throw new Error(`Pronunciation is unavailable for ${LANGUAGES[language].englishName}`)
  if (!isElevenLabsConfigured()) throw new Error('ELEVENLABS_API_KEY is required for pronunciation')
  const generate = async (voiceId: string): Promise<ArrayBuffer> => {
    const response = await fetchWithTimeout(
      `${ELEVENLABS_ORIGIN}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${DEFAULT_OUTPUT_FORMAT}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY!,
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Eleven v4 accepts native IPA enclosed in slashes; SSML phoneme tags are unsupported.
          text: ipa ? `"/${ipa}/"` : word,
          model_id: 'eleven_v4',
          language_code: languageCode,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            use_speaker_boost: true,
          },
        }),
      },
      CONFIG.timeouts.tts
    )
    if (!response.ok) throw await readElevenLabsError(response)
    return response.arrayBuffer()
  }
  const [preferred, fallback] = await stockVoices(languageCode)
  try {
    return await generate(preferred)
  } catch (error) {
    // Authentication, credit, rate and model failures cannot be cured by another voice.
    if (
      !fallback ||
      !(error instanceof ElevenLabsApiError) ||
      !VOICE_UNAVAILABLE[error.code ?? '']?.includes(error.status)
    )
      throw error
    return generate(fallback)
  }
}
