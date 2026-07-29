import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { EtymologyResult } from './types'

/**
 * New-cache path: storing a freshly synthesized result must revalidate the
 * word page's cache tag so /word/{word} stops serving the miss page.
 */

interface FakeRedis {
  set: ReturnType<typeof mock>
  get: ReturnType<typeof mock>
}

let currentRedis: FakeRedis | null = null
const revalidateTagMock = mock(() => undefined)
// after() defers until the response finishes; for the unit test the callback
// runs inline so its revalidateTag call is observable synchronously.
const afterMock = mock((task: () => void) => task())

mock.module('@/lib/redis', () => ({
  getRedis: () => currentRedis,
}))

// Superset of the surface other tests mock, so cross-file module mocks in
// bun's shared registry stay compatible.
mock.module('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: revalidateTagMock,
}))

const realNextServer = await import('next/server')
mock.module('next/server', () => ({
  ...realNextServer,
  after: afterMock,
}))

const {
  ETYMOLOGY_SCAN_PATTERN,
  cacheAudio,
  cacheEtymology,
  getCachedAudio,
  getCachedEtymology,
  lexemeFromEtymologyCacheKey,
} = await import('./cache')

const RESULT: EtymologyResult = {
  word: 'nice',
  pronunciation: '/naɪs/',
  definition: 'Pleasant; agreeable.',
  roots: [],
  ancestryGraph: { branches: [] },
  lore: 'From Latin nescius, ignorant.',
  sources: [],
}

function fakeRedis(overrides: Partial<FakeRedis> = {}): FakeRedis {
  return {
    set: mock(async () => 'OK'),
    get: mock(async () => null),
    ...overrides,
  }
}

beforeEach(() => {
  revalidateTagMock.mockClear()
  afterMock.mockClear()
  currentRedis = null
})

describe('cacheEtymology word-page revalidation', () => {
  test('revalidates the normalized per-word tag after a successful write', async () => {
    currentRedis = fakeRedis()

    await cacheEtymology('  NiCe ', RESULT)

    expect(currentRedis.set).toHaveBeenCalledTimes(1)
    expect(revalidateTagMock).toHaveBeenCalledTimes(1)
    expect(revalidateTagMock).toHaveBeenCalledWith('etymology-word:nice', { expire: 0 })
  })

  test('does not revalidate when the Redis write fails', async () => {
    currentRedis = fakeRedis({
      set: mock(async () => {
        throw new Error('redis down')
      }),
    })

    await cacheEtymology('nice', RESULT)

    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  test('does not revalidate when Redis is not configured', async () => {
    currentRedis = null

    await cacheEtymology('nice', RESULT)

    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  test('a revalidation failure (no request scope) does not break caching', async () => {
    currentRedis = fakeRedis()
    afterMock.mockImplementationOnce(() => {
      throw new Error('after() called outside a request scope')
    })

    await expect(cacheEtymology('nice', RESULT)).resolves.toBeUndefined()
    expect(currentRedis.set).toHaveBeenCalledTimes(1)
  })

  test('isolates same-spelling beta result and audio keys by language', async () => {
    currentRedis = fakeRedis()
    const betaResult: EtymologyResult = {
      language: 'it',
      word: 'sale',
      pronunciation: '/ˈsa.le/',
      definition: { en: 'salt', local: 'sale' },
      roots: [],
      ancestryGraph: { branches: [] },
      lore: { en: 'Salt has an old story.', local: 'Il sale ha una storia antica.' },
      sources: [],
      primaryHistoryId: 'it:sale:main',
      histories: [
        {
          id: 'it:sale:main',
          label: { en: 'salt', local: 'sale' },
          entryKind: 'lemma',
          queryNodeId: 'query:it:sale:main',
          lemmaNodeId: 'query:it:sale:main',
          evidenceScopeIds: ['wiktionaryNative:sale:main'],
          pronunciation: '/ˈsa.le/',
          definition: { en: 'salt', local: 'sale' },
          roots: [],
          ancestryGraph: { branches: [] },
          lore: { en: 'Salt has an old story.', local: 'Il sale ha una storia antica.' },
        },
      ],
    }

    await cacheEtymology('sale', betaResult, 'it')
    await cacheAudio('sale', 'audio-it', 'it')
    await cacheAudio('sale', 'audio-fr', 'fr')

    expect(currentRedis.set.mock.calls.map((call) => call[0])).toEqual([
      'etymology:beta:v5:it:sale',
      'audio:v1:it:sale',
      'audio:v1:fr:sale',
    ])
    expect(revalidateTagMock).toHaveBeenCalledWith('etymology-word:it:sale', { expire: 0 })
  })

  test('keeps the established English audio key while qualifying beta languages', async () => {
    currentRedis = fakeRedis({ get: mock(async () => 'audio-en') })

    expect(await getCachedAudio('  NiCe ', 'en')).toBe('audio-en')
    await cacheAudio('  NiCe ', 'audio-en', 'en')

    expect(currentRedis.get).toHaveBeenCalledWith('audio:v1:nice')
    expect(currentRedis.set).toHaveBeenCalledWith('audio:v1:nice', 'audio-en', {
      ex: expect.any(Number),
    })
  })

  test('decodes English and beta result keys from the shared sitemap scan', () => {
    expect(ETYMOLOGY_SCAN_PATTERN).toBe('etymology:*')
    expect(lexemeFromEtymologyCacheKey('etymology:v2.2:sale')).toEqual({
      language: 'en',
      word: 'sale',
    })
    expect(lexemeFromEtymologyCacheKey('etymology:beta:v5:it:sale')).toEqual({
      language: 'it',
      word: 'sale',
    })
    expect(lexemeFromEtymologyCacheKey('etymology:beta:v5:en:sale')).toBeNull()
  })

  test('never returns an English object from a beta cache key', async () => {
    currentRedis = fakeRedis({ get: mock(async () => RESULT) })
    expect(await getCachedEtymology('sale', 'it')).toBeNull()
  })
})
