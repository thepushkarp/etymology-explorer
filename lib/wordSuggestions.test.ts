import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { getWordSuggestions, type SuggestionCacheRedis } from './wordSuggestions'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

function provider(words: unknown[]) {
  const requests: URL[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(new URL(input instanceof Request ? input.url : String(input)))
    return Response.json(['', words])
  }) as unknown as typeof fetch
  return requests
}

function cache() {
  const values = new Map<string, unknown>()
  const writes: Array<{ key: string; ttl: number }> = []
  const client: SuggestionCacheRedis = {
    async get(key) {
      return values.get(key) ?? null
    },
    async set(key, value, options) {
      values.set(key, value)
      writes.push({ key, ttl: options.ex })
      return 'OK'
    },
  }
  return { client, values, writes }
}

describe('Wiktionary autocomplete', () => {
  test('offers attested affix spellings ahead of longer vocabulary prefixes', async () => {
    provider(['pan', 'pancake', 'pan-'])
    const suggestions = await getWordSuggestions('pan', 'en', false, undefined, null)
    expect(suggestions.slice(0, 2).map(({ word }) => word)).toEqual(['pan', 'pan-'])
    provider(['pan', 'pancake'])
    expect(
      (await getWordSuggestions('pan', 'en', false, undefined, null)).some(
        ({ word }) => word === 'pan-'
      )
    ).toBe(false)
  })
  test('Auto and English search English Wiktionary across scripts without GRE typo noise', async () => {
    const requests = provider(['津波', '津浪', '<invalid>', '津波'])
    for (const language of [undefined, 'en'] as const) {
      expect(await getWordSuggestions('津波', language, false, undefined, null)).toEqual([
        { word: '津波', distance: 0 },
        { word: '津浪', distance: 1 },
      ])
    }
    expect(requests).toHaveLength(2)
    expect(requests.every((url) => url.hostname === 'en.wiktionary.org')).toBe(true)
    expect(requests[0].searchParams.get('search')).toBe('津波')
    expect(requests[0].searchParams.get('action')).toBe('opensearch')
  })

  test('GRE prefixes rank before remote words; remote prefixes rank before GRE typo fill', async () => {
    provider(['absolute', 'abacus'])
    const suggestions = await getWordSuggestions('abs', undefined, false, undefined, null)
    expect(suggestions[0].word.startsWith('abs')).toBe(true)
    expect(suggestions.findIndex(({ word }) => word === 'abacus')).toBeGreaterThan(0)

    provider(['tsunami'])
    const expanded = await getWordSuggestions('tsun', 'en', false, undefined, null)
    expect(expanded[0].word).toBe('tsunami')
  })

  test('preserves non-Latin vowel marks in the provider prefix', async () => {
    const requests = provider(['पानी'])
    await getWordSuggestions('पानी', undefined, false, undefined, null)
    expect(requests.map((url) => url.searchParams.get('search'))).toEqual(['पानी'])
  })

  test('explicit language uses its native edition and keeps accent alternatives distinct', async () => {
    const requests = provider(['cote', 'côte', 'co\u0302te', 'côté'])
    expect(await getWordSuggestions('côte', 'fr', false, undefined, null)).toEqual([
      { word: 'côte', distance: 0 },
      { word: 'cote', distance: 1 },
      { word: 'côté', distance: 1 },
    ])
    expect(requests.every((url) => url.hostname === 'fr.wiktionary.org')).toBe(true)
    expect(requests.map((url) => url.searchParams.get('search')).sort()).toEqual(['cote', 'côte'])
  })

  test('ignores invalid and single-character input without a provider request', async () => {
    const requests = provider([])
    for (const query of ['a', '津', '<invalid>', 'ca\nfe']) {
      expect(await getWordSuggestions(query, undefined, false, undefined, null)).toEqual([])
    }
    expect(requests).toHaveLength(0)
  })

  test('caches canonical prefixes for a day without crossing language or Auto scopes', async () => {
    const { client, writes } = cache()
    const requests = provider(['café'])
    await getWordSuggestions('CAFE\u0301', 'fr', false, undefined, client)
    const requestCount = requests.length
    expect(await getWordSuggestions('café', 'fr', false, undefined, client)).toEqual([
      { word: 'café', distance: 0 },
    ])
    expect(requests).toHaveLength(requestCount)
    await getWordSuggestions('café', undefined, false, undefined, client)
    await getWordSuggestions('café', 'en', false, undefined, client)
    expect(writes).toEqual([
      { key: 'suggest:v2:fr:café', ttl: 86400 },
      { key: 'suggest:v2:auto:café', ttl: 86400 },
      { key: 'suggest:v2:en:café', ttl: 86400 },
    ])
  })

  test('cached autocomplete cannot suppress alternative-only lookups', async () => {
    const { client, writes } = cache()
    provider(['côte', 'cote'])
    await getWordSuggestions('côte', 'fr', false, undefined, client)
    const alternatives = await getWordSuggestions('côte', 'fr', true, undefined, client)
    expect(alternatives.map(({ word }) => word)).toEqual(['cote'])
    expect(writes).toHaveLength(1)
  })

  test('English typo recovery keeps its local wordlist without fetching autocomplete', async () => {
    const requests = provider(['unused'])
    const suggestions = await getWordSuggestions('aberrnt', 'en', true, undefined, null)
    expect(suggestions.some(({ word }) => word === 'aberrant')).toBe(true)
    expect(requests).toHaveLength(0)
  })

  test('malformed cached values fall through to the provider', async () => {
    const { client, values } = cache()
    values.set('suggest:v2:fr:café', [{ word: '<invalid>', distance: 0 }])
    const requests = provider(['café'])
    expect(await getWordSuggestions('café', 'fr', false, undefined, client)).toEqual([
      { word: 'café', distance: 0 },
    ])
    expect(requests).toHaveLength(2)
  })

  test('Redis failures preserve live suggestions and provider failures are not cached', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const unavailable: SuggestionCacheRedis = {
        async get() {
          throw new Error('Redis unavailable')
        },
        async set() {
          throw new Error('Redis unavailable')
        },
      }
      provider(['津波'])
      expect(await getWordSuggestions('津波', undefined, false, undefined, unavailable)).toEqual([
        { word: '津波', distance: 0 },
      ])

      const { client, writes } = cache()
      globalThis.fetch = (async () => new Response('', { status: 503 })) as unknown as typeof fetch
      expect(await getWordSuggestions('津波', undefined, false, undefined, client)).toEqual([])
      expect(writes).toHaveLength(0)
      provider(['津波'])
      expect(await getWordSuggestions('津波', undefined, false, undefined, client)).toHaveLength(1)
      expect(writes).toHaveLength(1)
    } finally {
      errors.mockRestore()
    }
  })

  test('caller cancellation propagates and cannot populate the cache', async () => {
    const { client, writes } = cache()
    const controller = new AbortController()
    globalThis.fetch = (async () => {
      controller.abort()
      throw controller.signal.reason
    }) as unknown as typeof fetch
    await expect(
      getWordSuggestions('津波', undefined, false, controller.signal, client)
    ).rejects.toThrow()
    expect(writes).toHaveLength(0)
  })
})
