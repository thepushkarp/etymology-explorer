import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { generatePronunciation } from './elevenlabs'

const originalFetch = globalThis.fetch
const originalVoice = process.env.ELEVENLABS_VOICE_ID
const originalKey = process.env.ELEVENLABS_API_KEY

beforeEach(() => {
  process.env.ELEVENLABS_VOICE_ID = 'voice-test'
  process.env.ELEVENLABS_API_KEY = 'secret-test'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  process.env.ELEVENLABS_VOICE_ID = originalVoice
  process.env.ELEVENLABS_API_KEY = originalKey
})

describe('ElevenLabs language selection', () => {
  test('passes the explicit ISO 639-1 language to eleven_v3', async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    }) as unknown as typeof fetch

    await generatePronunciation('casa', 'it')
    expect(requestBodies[0]?.model_id).toBe('eleven_v3')
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
