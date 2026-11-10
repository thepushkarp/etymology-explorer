import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { generatePronunciation, isElevenLabsConfigured } from './elevenlabs'

const originalFetch = globalThis.fetch
const originalVoice = process.env.ELEVENLABS_VOICE_ID
const originalKey = process.env.ELEVENLABS_API_KEY

beforeEach(() => {
  process.env.ELEVENLABS_VOICE_ID = 'voice-test'
  process.env.ELEVENLABS_API_KEY = 'secret-test'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalVoice === undefined) delete process.env.ELEVENLABS_VOICE_ID
  else process.env.ELEVENLABS_VOICE_ID = originalVoice
  if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY
  else process.env.ELEVENLABS_API_KEY = originalKey
})

describe('ElevenLabs language selection', () => {
  test('passes the explicit ISO 639-1 language to eleven_v4', async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    }) as unknown as typeof fetch

    await generatePronunciation('casa', 'it')
    expect(requestBodies[0]?.model_id).toBe('eleven_v4')
    expect(requestBodies[0]?.language_code).toBe('it')
  })

  test('keeps English as the backward-compatible default', async () => {
    let languageCode = ''
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      languageCode = (JSON.parse(String(init?.body)) as { language_code: string }).language_code
      return new Response(new Uint8Array([1]), { status: 200 })
    }) as unknown as typeof fetch

    await generatePronunciation('house')
    expect(languageCode).toBe('en')
  })
})

test('Hindi and Urdu retain their language, while Sanskrit requests a Hindi reading', async () => {
  const languageCodes: string[] = []
  globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
    languageCodes.push((JSON.parse(String(init?.body)) as { language_code: string }).language_code)
    return new Response(new Uint8Array([1]), { status: 200 })
  }) as unknown as typeof fetch
  await generatePronunciation('पानी', 'hi')
  await generatePronunciation('کتاب', 'ur')
  await generatePronunciation('धर्म', 'sa')
  expect(languageCodes).toEqual(['hi', 'ur', 'hi'])
})

test('a confirmed voice failure selects a language-matched female stock voice once', async () => {
  const calls: string[] = []
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push(url.pathname)
    if (calls.length === 1)
      return Response.json(
        { detail: { code: 'voice_not_found', message: 'Unavailable voice' } },
        { status: 404 }
      )
    if (url.pathname === '/v2/voices') {
      expect(url.searchParams.get('category')).toBe('premade')
      expect(url.searchParams.get('gender')).toBe('female')
      return Response.json({
        has_more: false,
        voices: [
          {
            voice_id: 'missing-metadata',
            category: null,
            labels: null,
            verified_languages: null,
            high_quality_base_model_ids: null,
          },
          { voice_id: 'male', category: 'premade', labels: { gender: 'male', language: 'ja' } },
          { voice_id: 'custom', category: 'cloned', labels: { gender: 'female', language: 'ja' } },
          {
            voice_id: 'generic',
            category: 'premade',
            labels: { gender: 'female', language: 'en' },
            high_quality_base_model_ids: ['eleven_multilingual_v2'],
          },
          {
            voice_id: 'matched',
            category: 'premade',
            labels: { gender: 'female', language: 'en' },
            verified_languages: [{ language: 'ja' }],
          },
        ],
      })
    }
    expect(JSON.parse(String(init?.body)).language_code).toBe('ja')
    return new Response(new Uint8Array([7]))
  }) as unknown as typeof fetch
  expect(new Uint8Array(await generatePronunciation('津波', 'ja'))).toEqual(new Uint8Array([7]))
  expect(calls).toEqual([
    '/v1/text-to-speech/voice-test',
    '/v2/voices',
    '/v1/text-to-speech/matched',
  ])
})

test.each([
  [401, 'invalid_api_key'],
  [429, 'voice_not_found'],
  [500, 'voice_not_found'],
  [403, 'insufficient_permissions'],
] as const)('HTTP %s with %s cannot trigger a stock retry', async (status, code) => {
  const fetch = mock(async () =>
    Response.json({ detail: { code, message: 'Provider rejected request' } }, { status })
  )
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch
  await expect(generatePronunciation('chat', 'fr')).rejects.toMatchObject({ status, code })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('key-only configuration uses multilingual female stock when target metadata is absent', async () => {
  delete process.env.ELEVENLABS_VOICE_ID
  expect(isElevenLabsConfigured()).toBe(true)
  const calls: string[] = []
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push(url.pathname)
    if (url.pathname === '/v2/voices')
      return Response.json({
        has_more: false,
        voices: [
          {
            voice_id: 'unverified',
            category: 'premade',
            labels: { gender: 'female', language: 'en' },
          },
          {
            voice_id: 'multilingual',
            category: 'premade',
            labels: { gender: 'female', language: 'en' },
            high_quality_base_model_ids: ['eleven_multilingual_v2'],
          },
        ],
      })
    expect(JSON.parse(String(init?.body)).language_code).toBe('ur')
    return Response.json(
      { detail: { status: 'voice_access_denied', message: 'Unavailable stock voice' } },
      { status: 403 }
    )
  }) as unknown as typeof fetch
  await expect(generatePronunciation('کتاب', 'ur')).rejects.toMatchObject({
    status: 403,
    code: 'voice_access_denied',
  })
  expect(calls).toEqual(['/v2/voices', '/v1/text-to-speech/multilingual'])
})
