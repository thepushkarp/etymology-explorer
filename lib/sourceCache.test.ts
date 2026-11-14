import { describe, expect, test } from 'bun:test'
import {
  getCachedSource,
  getCachedWiktionaryToc,
  cacheWiktionaryToc,
  cacheSource,
  getCachedSourceBundle,
  cacheSourceBundle,
  type SourceCacheRedis,
} from '@/lib/sourceCache'
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
  test('shares equivalent Unicode encodings without sharing accent variants', async () => {
    const store = createStore()
    await cacheSource('wiktionary', 'café', DATA, store)
    expect(await getCachedSource('wiktionary', 'cafe\u0301', store)).toEqual(DATA)
    expect(await getCachedSource('wiktionary', 'cafe', store)).toBeNull()
  })

  test('round-trips source data with a source-and-word-scoped key', async () => {
    const store = createStore()

    await store.set('src:v7:etymonline:telephone', DATA)
    expect(await getCachedSource('etymonline', 'telephone', store)).toBeNull()

    await cacheSource('etymonline', 'Telephone', DATA, store)

    expect(store.keys()).toContain('src:v18:etymonline:telephone')
    expect(await getCachedSource('etymonline', 'telephone', store)).toEqual(DATA)
  })

  test('the same word under a different source is a separate entry', async () => {
    const store = createStore()

    await cacheSource('etymonline', 'telephone', DATA, store)

    expect(await getCachedSource('wiktionary', 'telephone', store)).toBeNull()
  })

  test('same-spelling lexemes in other languages use language-qualified source keys', async () => {
    const store = createStore()
    await cacheSource('wiktionaryNative', 'sale', DATA, store, 'it')
    await cacheSource('wiktionaryNative', 'sale', DATA, store, 'fr')

    expect(store.keys().sort()).toEqual([
      'src:v18:wiktionaryNative:fr:sale',
      'src:v18:wiktionaryNative:it:sale',
    ])
  })

  test('historical language selections retain complete provenance without crossing languages', async () => {
    const store = createStore()
    const latin = {
      text: 'Complete Latin history and final reference.',
      url: 'https://en.wiktionary.org/wiki/mala',
      requestedWord: 'mala',
      resolvedWord: 'mala',
      revisionId: 77,
      variants: [
        {
          word: 'māla',
          relationship: 'spelling-variant' as const,
          url: 'https://en.wiktionary.org/wiki/m%C4%81la',
        },
      ],
    }
    await cacheSource('wiktionaryLanguage:Latin', 'mala', latin, store)
    expect(await getCachedSource('wiktionaryLanguage:Latin', 'mala', store)).toEqual(latin)
    expect(await getCachedSource('wiktionaryLanguage:Old%20French', 'mala', store)).toBeNull()
    expect(await getCachedSource('wiktionary', 'mala', store)).toBeNull()
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
    await store.set('src:v18:etymonline:telephone', {
      text: 42,
      url: 'https://example.com',
    } as unknown as SourceData)

    expect(await getCachedSource('etymonline', 'telephone', store)).toBeNull()
  })
})

test('Wikipedia cache preserves full text and metadata and isolates editions', async () => {
  const store = createStore()
  const article = {
    ...DATA,
    text: 'Lead\nHistory\nUntruncated final paragraph',
    language: 'fr' as const,
    revisionId: 42,
  }
  await cacheSource('wikipedia', 'pomme de terre', article, store, 'fr')
  expect(await getCachedSource('wikipedia', 'pomme de terre', store, 'fr')).toEqual(article)
  expect(await getCachedSource('wikipedia', 'pomme de terre', store, 'it')).toBeNull()
  expect(await getCachedSource('wikipedia', 'pomme de terre', store, 'en')).toBeNull()
})

test('source bundles preserve publisher provenance and historical language isolation', async () => {
  const store = createStore()
  const records = [
    {
      provider: 'lewisShort' as const,
      sourceFamily: 'lewisShort' as const,
      data: {
        ...DATA,
        lexicalLanguage: 'Latin',
        text: 'Complete historical entry with its final reference.',
        retrieval: { method: 'exa' as const, retrievedAt: '2026-11-04T00:00:00Z' },
      },
    },
  ]
  await cacheSourceBundle('lewisShort', 'casa', 'Latin', records, store)
  expect(await getCachedSourceBundle('lewisShort', 'casa', 'Latin', store)).toEqual(records)
  expect(await getCachedSourceBundle('lewisShort', 'casa', 'Italian', store)).toBeNull()
  expect(await getCachedSourceBundle('lsj', 'casa', 'Latin', store)).toBeNull()
})

test('partial source entries and bundles are not stored for seven days', async () => {
  const store = createStore()
  const data = { ...DATA, incomplete: true }
  await cacheSource('etymonline', 'fixture', data, store)
  await cacheSourceBundle(
    'deMauro',
    'fixture',
    'Italian',
    [{ provider: 'deMauro', sourceFamily: 'deMauro', data }],
    store
  )
  expect(store.keys()).toEqual([])
})

test('TOC cache preserves page-order headings and authoritative absence per edition', async () => {
  const store = createStore()
  const toc = { headings: ['English', 'German', 'French'], nonemptyHeadings: ['English', 'French'] }
  await cacheWiktionaryToc('Fixture', 'en', toc, store)
  await cacheWiktionaryToc('fixture', 'fr', { headings: [], nonemptyHeadings: [] }, store)
  expect(store.keys()).toEqual([
    'src:v18:wiktionaryToc:fixture',
    'src:v18:wiktionaryToc:fr:fixture',
  ])
  expect(await getCachedWiktionaryToc('fixture', 'en', store)).toEqual(toc)
  expect(await getCachedWiktionaryToc('fixture', 'fr', store)).toEqual({
    headings: [],
    nonemptyHeadings: [],
  })
  expect(await getCachedWiktionaryToc('fixture', 'it', store)).toBeNull()
  expect(await getCachedWiktionaryToc('fixture', 'en', null)).toBeNull()
})
