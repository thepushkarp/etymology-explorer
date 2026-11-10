import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { EtymologyResult, WordEntry } from './types'
import type { SpellingProof } from './cache'
import { CONFIG } from './config'
import { etymologyResult } from './testSupport/etymologyResult'

interface FakeRedis {
  set: ReturnType<typeof mock>
  get: ReturnType<typeof mock>
  exists: ReturnType<typeof mock>
  scan: ReturnType<typeof mock>
}
let currentRedis: FakeRedis | null = null
const revalidateTagMock = mock(() => undefined)
const afterMock = mock((task: () => void) => task())
mock.module('@/lib/redis', () => ({ getRedis: () => currentRedis }))
mock.module('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: revalidateTagMock,
}))
const realNextServer = await import('next/server')
mock.module('next/server', () => ({ ...realNextServer, after: afterMock }))
const {
  cacheAudio,
  cacheEntry,
  cacheNegative,
  etymologyWordTag,
  getCachedAudio,
  getCachedEntry,
  getNegativeCache,
  upgradeLegacyEntry,
  getCachedSpellingEntry,
  mergeEntrySpellings,
  spellingMetadata,
  publishSpellingAliases,
} = await import('./cache')
const { scanTracedWords } = await import('./tracedWords')

const RESULT = etymologyResult({ word: 'nice', definition: 'Pleasant.', lore: 'An old story.' })
function entry(result: EtymologyResult = RESULT, fields: Partial<WordEntry> = {}): WordEntry {
  return {
    word: result.word,
    languages: [result.language],
    entries: { [result.language]: result },
    otherLanguages: [],
    tracedAt: new Date().toISOString(),
    revision: CONFIG.pipelineRevision,
    ...fields,
  }
}
function fakeRedis(overrides: Partial<FakeRedis> = {}): FakeRedis {
  return {
    set: mock(async () => 'OK'),
    get: mock(async () => null),
    exists: mock(async () => 0),
    scan: mock(async () => ['0', []]),
    ...overrides,
  }
}
beforeEach(() => {
  revalidateTagMock.mockClear()
  afterMock.mockClear()
  currentRedis = null
})

describe('durable entries', () => {
  test('spelling redirects require fresh source and terminal proof, membership, and language scope', async () => {
    const verifiedAt = new Date(Date.now() - 1000).toISOString()
    const proof: SpellingProof = {
      word: 'つなみ',
      targetWord: '津波',
      language: 'ja',
      kind: 'spelling',
      sourceUrl: 'https://en.wiktionary.org/wiki/つなみ',
      verifiedAt,
      terminal: { word: '津波', sourceUrl: 'https://en.wiktionary.org/wiki/津波', verifiedAt },
    }
    const owner = mergeEntrySpellings(
      entry(etymologyResult({ word: '津波', language: 'ja', definition: 'Tsunami.' })),
      [spellingMetadata([proof])]
    )
    const values = new Map<string, unknown>()
    currentRedis = fakeRedis({
      get: mock(async (key: string) => values.get(key) ?? null),
      set: mock(async (key: string, value: unknown) => {
        values.set(key, structuredClone(value))
        return 'OK'
      }),
    })
    await cacheEntry(owner.word, owner)
    await publishSpellingAliases(owner, [proof])
    expect((await getCachedSpellingEntry('つなみ', 'ja'))?.entry.word).toBe('津波')
    expect(revalidateTagMock).toHaveBeenCalledWith('etymology-word:つなみ', { expire: 0 })
    expect((await getCachedSpellingEntry('つなみ'))?.word).toBe('津波')
    values.delete('entry:v1:津波')
    currentRedis.get.mockClear()
    expect(await getCachedSpellingEntry('つなみ', 'ja')).toBeNull()
    expect(currentRedis.get.mock.calls.some(([key]) => String(key).startsWith('etymology:'))).toBe(
      false
    )
    values.set('entry:v1:津波', owner)
    values.set('etymology:v2.7:つなみ', etymologyResult({ word: 'つなみ', language: 'en' }))
    expect(await getCachedSpellingEntry('つなみ')).toBeNull()
    expect((await getCachedSpellingEntry('つなみ', 'ja'))?.word).toBe('津波')
    expect(await getCachedSpellingEntry('つなみ', 'en')).toBeNull()
    values.set('entry:v1:津波', { ...owner, spellings: [] })
    expect(await getCachedSpellingEntry('つなみ', 'ja')).toBeNull()
    values.set('entry:v1:津波', owner)
    const old = new Date(Date.now() - (CONFIG.sourceCacheTTL + 1) * 1000).toISOString()
    values.set('entry-alias:v1:ja:つなみ', {
      word: '津波',
      revision: 1,
      proofs: [{ ...proof, terminal: { ...proof.terminal, verifiedAt: old } }],
    })
    expect(await getCachedSpellingEntry('つなみ', 'ja')).toBeNull()
    values.set('entry:v1:津波', {
      ...owner,
      spellings: owner.spellings!.map((spelling) => ({ ...spelling, verifiedAt: old })),
    })
    expect((await getCachedEntry('津波'))?.entry.spellings).toEqual([])
    await cacheEntry('津波', { ...owner, spellings: [] })
    expect(revalidateTagMock).toHaveBeenLastCalledWith('etymology-word:つなみ', { expire: 0 })
  })
  test('keeps complete and incomplete traces for one year and invalidates one word tag', async () => {
    currentRedis = fakeRedis()
    const value = entry()
    await cacheEntry('  NiCe ', value, { incomplete: true })
    expect(currentRedis.set).toHaveBeenCalledWith(
      'entry:v1:nice',
      { ...value, incomplete: true },
      { ex: 365 * 86400 }
    )
    expect(revalidateTagMock).toHaveBeenCalledWith('etymology-word:nice', { expire: 0 })
    expect(etymologyWordTag('cafe\u0301')).toBe('etymology-word:café')
    await cacheEntry('nice', value)
    expect(currentRedis.set).toHaveBeenLastCalledWith('entry:v1:nice', value, { ex: 365 * 86400 })
  })

  test('serves old revisions and dates as stale, and short-retries incomplete entries', async () => {
    const fresh = entry()
    const values = [
      [fresh, false],
      [entry(RESULT, { revision: 0 }), true],
      [entry(RESULT, { tracedAt: new Date(Date.now() - 91 * 86400_000).toISOString() }), true],
      [entry(RESULT, { incomplete: true }), false],
      [
        entry(RESULT, {
          researchIncomplete: false,
          freshnessAt: new Date(Date.now() - 301_000).toISOString(),
        }),
        false,
      ],
      [
        entry(RESULT, {
          researchIncomplete: true,
          incomplete: true,
          freshnessAt: new Date(Date.now() - 301_000).toISOString(),
        }),
        true,
      ],
      [entry(RESULT, { freshnessAt: new Date(Date.now() - 91 * 86400_000).toISOString() }), true],
      [
        entry(RESULT, { incomplete: true, tracedAt: new Date(Date.now() - 301_000).toISOString() }),
        true,
      ],
    ] as const
    for (const [value, stale] of values) {
      currentRedis = fakeRedis({ get: mock(async () => value) })
      expect(await getCachedEntry(' NICE ')).toEqual({ entry: value, stale })
      expect(currentRedis.set).not.toHaveBeenCalled()
    }
  })

  test('validates spelling, nested language identity and required result fields', async () => {
    for (const value of [
      entry({ ...RESULT, word: 'other' }),
      { ...entry(), word: 'other' },
      entry({ ...RESULT, language: 'fr' }, { languages: ['en'] }),
      { word: 'nice' },
    ]) {
      currentRedis = fakeRedis({ get: mock(async () => value) })
      expect(await getCachedEntry('nice')).toBeNull()
    }
    const accented = entry({ ...RESULT, word: 'café' })
    currentRedis = fakeRedis({ get: mock(async () => accented) })
    expect((await getCachedEntry('cafe\u0301'))?.entry.word).toBe('café')
  })

  test('restores failed languages separately from successful entries', async () => {
    const value = entry(RESULT, {
      incomplete: true,
      failedLanguages: {
        fr: {
          kind: 'transient',
          message: 'The source is temporarily unavailable.',
          retryAt: new Date(Date.now() + 300_000).toISOString(),
        },
      },
    })
    currentRedis = fakeRedis({ get: mock(async () => value) })
    expect((await getCachedEntry('nice'))?.entry).toEqual(value)
    expect(value.languages).toEqual(['en'])
    currentRedis.get.mockImplementation(async () => ({
      ...value,
      failedLanguages: { fr: { ...value.failedLanguages!.fr, retryAt: 'later' } },
    }))
    expect(await getCachedEntry('nice')).toBeNull()
  })

  test('does not invalidate after failed writes, and tolerates absent request scope', async () => {
    currentRedis = fakeRedis({
      set: mock(async () => {
        throw new Error('redis down')
      }),
    })
    await expect(cacheEntry('nice', entry())).rejects.toThrow(
      'Could not store entry "nice": redis down'
    )
    expect(revalidateTagMock).not.toHaveBeenCalled()
    currentRedis = fakeRedis()
    afterMock.mockImplementationOnce(() => {
      throw new Error('no request scope')
    })
    await expect(cacheEntry('nice', entry())).resolves.toBeUndefined()
    currentRedis = null
    expect(await getCachedEntry('nice')).toBeNull()
    await expect(cacheEntry('nice', entry())).rejects.toThrow('Redis is not configured')
  })
})

describe('legacy entry migration', () => {
  test('recovers the original English cache shape without language or history fields', () => {
    const legacy: Record<string, unknown> = { ...RESULT, examples: ['A nice day.'] }
    delete legacy.language
    delete legacy.histories
    delete legacy.primaryHistoryId
    const upgraded = upgradeLegacyEntry('nice', { en: legacy })!
    expect(upgraded.entries.en?.language).toBe('en')
    expect(upgraded.entries.en?.histories[0]).toMatchObject({
      entryKind: 'unresolved',
      lore: RESULT.lore,
      ancestryGraph: RESULT.ancestryGraph,
      examples: [{ text: 'A nice day.' }],
    })
    expect(upgraded.entries.en?.primaryHistoryId).toBe(upgraded.entries.en?.histories[0].id)
    expect(legacy).not.toHaveProperty('language')
    expect(upgradeLegacyEntry('nice', { en: { ...legacy, word: 'other' } })).toBeNull()
  })

  test('purely converts paired prose and examples throughout independent histories', () => {
    const italian = etymologyResult({
      language: 'it',
      word: 'nice',
      definition: 'An Italian word.',
    })
    const paired = {
      ...italian,
      definition: { en: 'An Italian word.', local: 'Una parola.' },
      lore: { en: 'English story.', local: 'Storia.' },
      examples: [{ en: 'An example.', local: 'Un esempio.' }],
      histories: italian.histories.map((history) => ({
        ...history,
        lore: { en: 'History story.', local: 'Storia della parola.' },
        examples: [{ en: 'Another example.', local: 'Un altro esempio.' }],
      })),
    }
    const english = { ...RESULT, examples: ['A nice day.'] }
    const snapshot = structuredClone(paired)
    const upgraded = upgradeLegacyEntry(' NICE ', {
      en: english,
      it: paired,
      fr: { broken: true },
    })!
    expect(upgraded.languages).toEqual(['en', 'it'])
    expect(upgraded.revision).toBe(0)
    expect(upgraded.entries.en?.examples).toEqual([{ text: 'A nice day.' }])
    expect(upgraded.entries.it?.lore).toBe('English story.')
    expect(upgraded.entries.it?.examples).toEqual([
      { text: 'Un esempio.', translation: 'An example.' },
    ])
    expect(upgraded.entries.it?.histories[0].examples).toEqual([
      { text: 'Un altro esempio.', translation: 'Another example.' },
    ])
    expect(paired).toEqual(snapshot)
    expect(upgradeLegacyEntry('nice', { it: RESULT, en: { ...RESULT, word: 'other' } })).toBeNull()
  })

  test('lazily writes a durable stale entry without overwriting a competing trace', async () => {
    currentRedis = fakeRedis({
      get: mock(async (key: string) => (key === 'etymology:v2.7:nice' ? RESULT : null)),
    })
    const migrated = await getCachedEntry('nice')
    expect(migrated?.stale).toBe(true)
    expect(migrated?.entry.languages).toEqual(['en'])
    expect(currentRedis.set).toHaveBeenCalledWith('entry:v1:nice', migrated?.entry, {
      ex: 365 * 86400,
      nx: true,
    })
    const fresh = entry()
    let reads = 0
    currentRedis = fakeRedis({
      get: mock(async (key: string) =>
        key === 'entry:v1:nice'
          ? ++reads > 1
            ? fresh
            : null
          : key === 'etymology:v2.7:nice'
            ? RESULT
            : null
      ),
      set: mock(async () => null),
    })
    expect(await getCachedEntry('nice')).toEqual({ entry: fresh, stale: false })
  })

  test('serves successful legacy siblings but retries migration after a failed sibling read', async () => {
    currentRedis = fakeRedis({
      get: mock(async (key: string) => {
        if (key === 'etymology:beta:v9:it:nice') throw new Error('temporary read failure')
        return key === 'etymology:v2.7:nice' ? RESULT : null
      }),
    })
    expect((await getCachedEntry('nice'))?.entry.languages).toEqual(['en'])
    expect(currentRedis.set).not.toHaveBeenCalled()
  })
})

describe('independent negative and audio caches', () => {
  test('isolates Auto negatives from hints and preserves durable entries on failed retraces', async () => {
    currentRedis = fakeRedis()
    await cacheNegative(' NICE ', 'no_sources')
    await cacheNegative('nice', 'no_sources', 'fr')
    expect(currentRedis.set.mock.calls.map((call) => call[0])).toEqual([
      'neg:v7:nice',
      'neg:v7:hint:fr:nice',
    ])
    await getNegativeCache(' NICE ')
    await getNegativeCache('nice', 'en')
    expect(currentRedis.get).toHaveBeenCalledWith('neg:v7:nice')
    expect(currentRedis.get).toHaveBeenCalledWith('neg:v7:hint:en:nice')
    currentRedis = fakeRedis({ exists: mock(async () => 1) })
    await cacheNegative('nice', 'no_sources')
    expect(currentRedis.set).not.toHaveBeenCalled()
    currentRedis = fakeRedis()
    await cacheNegative('nice', 'timeout')
    expect(currentRedis.set).not.toHaveBeenCalled()
  })

  test('negative metadata preserves canonical script targets and rejects malformed cache values', async () => {
    const otherScripts = [{ word: ' नमस्ते ', language: 'hi' as const }]
    currentRedis = fakeRedis()
    await cacheNegative('namaste', 'no_sources', undefined, otherScripts)
    expect(currentRedis.set).toHaveBeenCalledWith(
      'neg:v7:namaste',
      { otherScripts: [{ word: 'नमस्ते', language: 'hi' }] },
      { ex: expect.any(Number) }
    )
    currentRedis = fakeRedis({
      get: mock(async () => ({
        otherScripts: [
          ...otherScripts,
          { word: 'नमस्ते', language: 'hi' },
          { word: 'namaste', language: 'hi' },
          { word: 'a\nb', language: 'en' },
        ],
      })),
    })
    expect(await getNegativeCache('namaste')).toEqual({
      otherScripts: [{ word: 'नमस्ते', language: 'hi' }],
    })
    for (const value of ['1', true, [], null]) {
      currentRedis = fakeRedis({ get: mock(async () => value) })
      expect(await getNegativeCache('namaste')).toBeNull()
    }
    currentRedis = fakeRedis({ get: mock(async () => ({})) })
    expect(await getNegativeCache('namaste')).toEqual({})
  })

  test('retains established audio namespaces and language isolation', async () => {
    currentRedis = fakeRedis({ get: mock(async () => 'audio') })
    expect(await getCachedAudio(' NICE ')).toBe('audio')
    await cacheAudio('nice', 'audio')
    await cacheAudio('sale', 'italian', 'it')
    await cacheAudio('धर्म', 'hindi', 'hi')
    await cacheAudio('धर्म', 'hindi reading', 'sa')
    expect(currentRedis.get).toHaveBeenCalledWith('audio:v2:nice')
    expect(currentRedis.set.mock.calls.map((call) => call[0])).toEqual([
      'audio:v2:nice',
      'audio:v2:it:sale',
      'audio:v2:hi:धर्म',
      'audio:v2:sa:धर्म',
    ])
  })
})

describe('traced corpus discovery', () => {
  test('migrates unvisited legacy entries while scanning the corpus', async () => {
    currentRedis = fakeRedis({
      scan: mock(async (_cursor: string, options: { match: string }) => [
        '0',
        options.match === 'etymology:v2.7:*' ? ['etymology:v2.7:nice'] : [],
      ]),
      get: mock(async (key: string) => (key === 'etymology:v2.7:nice' ? RESULT : null)),
    })
    expect(await scanTracedWords()).toEqual([{ word: 'nice' }])
    expect(currentRedis.set).toHaveBeenCalledWith(
      'entry:v1:nice',
      expect.objectContaining({ revision: 0, languages: ['en'] }),
      { ex: 365 * 86400, nx: true }
    )
  })

  test('deduplicates durable and unvisited legacy keys while following SCAN cursors', async () => {
    currentRedis = fakeRedis({
      scan: mock(async (cursor: string, options: { match: string }) => {
        if (options.match === 'entry:v1:*')
          return cursor === '0' ? ['12', ['entry:v1:nice']] : ['0', ['entry:v1:cafe\u0301']]
        if (options.match === 'etymology:v2.7:*')
          return ['0', ['etymology:v2.7:nice', 'etymology:v2.7:old', 'etymology:v2.7:bad\nword']]
        return [
          '0',
          ['etymology:beta:v9:it:old', 'etymology:beta:v9:fr:chat', 'etymology:beta:v9:zz:bad'],
        ]
      }),
    })
    expect(await scanTracedWords()).toEqual([
      { word: 'nice' },
      { word: 'café' },
      { word: 'old' },
      { word: 'chat' },
    ])
    expect(currentRedis.set).not.toHaveBeenCalled()
    expect(currentRedis.scan).toHaveBeenCalledTimes(4)
  })

  test('bounds empty scan cursors and continues independent legacy scans after failure', async () => {
    currentRedis = fakeRedis({
      scan: mock(async (_cursor: string, options: { match: string }) => {
        if (options.match === 'entry:v1:*') return ['1', []]
        if (options.match === 'etymology:v2.7:*') throw new Error('scan unavailable')
        return ['0', ['etymology:beta:v9:it:sale']]
      }),
    })
    expect(await scanTracedWords()).toEqual([{ word: 'sale' }])
    expect(currentRedis.scan).toHaveBeenCalledTimes(102)
  })
})
