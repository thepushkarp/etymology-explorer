import { describe, expect, test } from 'bun:test'
import { getCachedSource, cacheSource, type SourceCacheRedis } from '@/lib/sourceCache'
import type { SourceData } from '@/lib/types'

/** Map-backed double mirroring @upstash/redis object (de)serialization. */
function createStore(): SourceCacheRedis & { keys(): string[] } {
  const store = new Map<string, unknown>()
  return {
    async get(key) {
      return store.get(key) ?? null
    },
    async set(key, value) {
      store.set(key, value)
      return 'OK'
    },
    keys() {
      return [...store.keys()]
    },
  }
}

function createFailingStore(): SourceCacheRedis {
  const fail = () => Promise.reject(new Error('redis connection refused'))
  return { get: fail, set: fail }
}

const DATA: SourceData = {
  text: '1835, from French téléphone',
  url: 'https://www.etymonline.com/word/telephone',
  relatedEntries: ['tele-', 'phone'],
}

describe('source cache', () => {
  test('round-trips source data with a source-and-word-scoped key', async () => {
    const store = createStore()

    await cacheSource('etymonline', 'Telephone', DATA, store)

    expect(store.keys()).toEqual(['src:v1:etymonline:telephone'])
    expect(await getCachedSource('etymonline', 'telephone', store)).toEqual(DATA)
  })

  test('the same word under a different source is a separate entry', async () => {
    const store = createStore()

    await cacheSource('etymonline', 'telephone', DATA, store)

    expect(await getCachedSource('wiktionary', 'telephone', store)).toBeNull()
  })

  test('same-spelling beta lexemes use language-qualified source keys', async () => {
    const store = createStore()
    await cacheSource('wiktionaryNative', 'sale', DATA, store, 'it')
    await cacheSource('wiktionaryNative', 'sale', DATA, store, 'fr')

    expect(store.keys().sort()).toEqual([
      'src:v1:wiktionaryNative:fr:sale',
      'src:v1:wiktionaryNative:it:sale',
    ])
  })

  test('fails open without a Redis client', async () => {
    expect(await getCachedSource('etymonline', 'telephone', null)).toBeNull()
    await cacheSource('etymonline', 'telephone', DATA, null) // must not throw
  })

  test('fails open when Redis errors', async () => {
    const store = createFailingStore()

    expect(await getCachedSource('etymonline', 'telephone', store)).toBeNull()
    await cacheSource('etymonline', 'telephone', DATA, store) // must not throw
  })

  test('treats malformed cache entries as misses', async () => {
    const store = createStore()
    await store.set('src:v1:etymonline:telephone', {
      text: 42,
      url: 'https://example.com',
    } as unknown as SourceData)

    expect(await getCachedSource('etymonline', 'telephone', store)).toBeNull()
  })
})
