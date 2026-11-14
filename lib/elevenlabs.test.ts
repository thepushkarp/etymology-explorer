import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { generatePronunciation, isElevenLabsConfigured } from './elevenlabs'

const originalFetch = globalThis.fetch
const originalKey = process.env.ELEVENLABS_API_KEY
beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = 'secret-test'
})
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY
  else process.env.ELEVENLABS_API_KEY = originalKey
})

const voices = [
  {
    voice_id: 'english',
    labels: { gender: 'female', language: 'en' },
    high_quality_base_model_ids: ['eleven_multilingual_v2'],
  },
  {
    voice_id: 'verified',
    labels: { gender: 'female', language: 'en' },
    verified_languages: [{ language: 'fr' }, { language: 'ja' }],
  },
  { voice_id: 'french', labels: { gender: 'female', language: 'fr' } },
  { voice_id: 'male', labels: { gender: 'male', language: 'ja' } },
  { voice_id: 'unlabelled' },
]

function provider(synthesize?: (voice: string) => Response, catalog = { has_more: false, voices }) {
  const calls: string[] = []
  const bodies: Array<Record<string, unknown>> = []
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push(url.pathname)
    if (url.pathname === '/v2/voices') {
      expect(url.searchParams.get('voice_type')).toBe('default')
      expect(url.searchParams.get('gender')).toBe('female')
      return Response.json(catalog)
    }
    bodies.push(JSON.parse(String(init?.body)))
    return synthesize?.(url.pathname.split('/').at(-1)!) ?? new Response(new Uint8Array([1]))
  }) as unknown as typeof fetch
  return { calls, bodies }
}

test('selects language-labelled female defaults before verified and multilingual voices, with IPA', async () => {
  const { calls, bodies } = provider()
  await generatePronunciation('pain', 'en', 'peɪn')
  await generatePronunciation('pain', 'fr', 'pɛ̃')
  await generatePronunciation('津波', 'ja')
  expect(calls.filter((path) => path.startsWith('/v1'))).toEqual([
    '/v1/text-to-speech/english',
    '/v1/text-to-speech/french',
    '/v1/text-to-speech/verified',
  ])
  expect(
    bodies.map(({ text, language_code, model_id }) => ({ text, language_code, model_id }))
  ).toEqual([
    { text: '"/peɪn/"', language_code: 'en', model_id: 'eleven_v4' },
    { text: '"/pɛ̃/"', language_code: 'fr', model_id: 'eleven_v4' },
    { text: '津波', language_code: 'ja', model_id: 'eleven_v4' },
  ])
})

test('uses multilingual female fallback where no match exists, retaining the Sanskrit Hindi reading', async () => {
  expect(isElevenLabsConfigured()).toBe(true)
  const { calls, bodies } = provider()
  await generatePronunciation('house')
  await generatePronunciation('पानी', 'hi')
  await generatePronunciation('کتاب', 'ur')
  await generatePronunciation('धर्म', 'sa')
  expect(bodies.map((body) => body.language_code)).toEqual(['en', 'hi', 'ur', 'hi'])
  expect(calls.filter((path) => path.startsWith('/v1'))).toEqual(
    Array(4).fill('/v1/text-to-speech/english')
  )
})

test('a precise voice failure retries the next ranked female voice without fetching the catalog again', async () => {
  const { calls } = provider((voice) =>
    voice === 'french'
      ? Response.json(
          { detail: { code: 'voice_not_found', message: 'Unavailable voice' } },
          { status: 404 }
        )
      : new Response(new Uint8Array([7]))
  )
  expect(new Uint8Array(await generatePronunciation('pain', 'fr'))).toEqual(new Uint8Array([7]))
  expect(calls).toEqual(['/v2/voices', '/v1/text-to-speech/french', '/v1/text-to-speech/verified'])
})

test.each([
  [401, 'invalid_api_key'],
  [429, 'voice_not_found'],
  [500, 'voice_not_found'],
  [403, 'insufficient_permissions'],
] as const)('HTTP %s with %s does not try another voice', async (status, code) => {
  const { calls } = provider(() =>
    Response.json({ detail: { code, message: 'Provider rejected request' } }, { status })
  )
  await expect(generatePronunciation('chat', 'fr')).rejects.toMatchObject({ status, code })
  expect(calls).toEqual(['/v2/voices', '/v1/text-to-speech/french'])
})

test('alternate voice failure is not retried again', async () => {
  const { calls } = provider(() =>
    Response.json(
      { detail: { status: 'voice_access_denied', message: 'Unavailable' } },
      { status: 403 }
    )
  )
  await expect(generatePronunciation('chat', 'fr')).rejects.toMatchObject({
    status: 403,
    code: 'voice_access_denied',
  })
  expect(calls).toHaveLength(3)
})

test('an empty or incomplete catalog fails before synthesis', async () => {
  for (const catalog of [
    { voices: [], has_more: false },
    { voices, has_more: true },
  ]) {
    const { calls } = provider(undefined, catalog)
    await expect(generatePronunciation('chat', 'fr')).rejects.toThrow()
    expect(calls).toEqual(['/v2/voices'])
  }
})
