import { afterEach, expect, spyOn, test } from 'bun:test'
import manifest from '../data/jmdict/manifest.json'
import { fetchJmdict, selectJmdictEntries, type JmdictEntry } from './jmdict'
import { SourceFetchBudget } from './sourceFetchBudget'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

test('official index preserves independent exact homographs without HTTP or Redis', async () => {
  globalThis.fetch = (() => {
    throw new Error('No HTTP allowed')
  }) as unknown as typeof fetch
  const budget = new SourceFetchBudget(0)
  const [record] = await budget.run(() => fetchJmdict(' しろ '))
  const groups = record.data.entryGroups!
  expect(groups.some((group) => group.heading.includes('castle'))).toBe(true)
  expect(groups.some((group) => group.heading.includes('white'))).toBe(true)
  expect(groups.some((group) => group.heading.includes('substitution'))).toBe(true)
  expect(new Set(groups.map((group) => group.index)).size).toBe(groups.length)
  expect(record.data.license).toContain('CC BY-SA 4.0')
  expect(record.data.revisionId).toBeString()
  expect(record.data.text).toContain('<entry>')
  expect(budget.attempts).toBe(0)
  expect(await fetchJmdict('ありえないテスト語xyz')).toEqual([])
  const abort = new AbortController()
  abort.abort()
  await expect(fetchJmdict('しろ', abort.signal)).rejects.toThrow()
})

test('reading-only queries select the matching 生物 entry rather than every kanji reading', async () => {
  const raw = await fetchJmdict('なまもの')
  const living = await fetchJmdict('せいぶつ')
  expect(raw[0].data.entryGroups!.map((group) => group.heading).join()).toContain('raw food')
  expect(raw[0].data.entryGroups!.map((group) => group.heading).join()).not.toContain('organism')
  expect(living[0].data.entryGroups!.map((group) => group.heading).join()).toContain('organism')
  expect(living[0].data.entryGroups!.map((group) => group.heading).join()).not.toContain('raw food')
})

test('an expired dictionary is unavailable rather than a durable absence', async () => {
  const clock = spyOn(Date, 'now').mockReturnValue(Date.parse(manifest.date) + 32 * 86_400_000)
  try {
    await expect(fetchJmdict('しろ')).rejects.toThrow('monthly refresh')
  } finally {
    clock.mockRestore()
  }
})

test('source defaults and wasei flags survive original XML indexing without inventing ancestry', async () => {
  for (const [word, language, wasei] of [
    ['アルバイト', 'ger', false],
    ['サラリーマン', 'eng', true],
  ] as const) {
    const [record] = await fetchJmdict(word)
    expect(record.evidenceRole).toBe('lexical')
    expect(record.data.entryGroups![0].text).toContain(`"language":"${language}"`)
    expect(record.data.entryGroups![0].text).toContain('"type":"full"')
    expect(record.data.entryGroups![0].text).toContain(`"wasei":${wasei}`)
    expect(record.data.entryGroups![0].relations).toBeUndefined()
  }
})

test('reading restrictions, no-kanji flags and both sense restrictions must match the same pair', () => {
  const spelling = (word: string) => ({ word, info: [], priority: [] })
  const entry: JmdictEntry = {
    id: 'fixture',
    xml: '<entry/>',
    kanji: [spelling('甲'), spelling('乙')],
    readings: [
      { ...spelling('こう'), restrict: ['甲'], noKanji: false },
      { ...spelling('おつ'), restrict: ['乙'], noKanji: false },
      { ...spelling('かな'), restrict: [], noKanji: true },
    ],
    senses: [
      {
        kanji: ['乙'],
        readings: ['おつ'],
        pos: ['noun'],
        glosses: ['second'],
        loans: [],
        xml: '<sense/>',
      },
    ],
  }
  expect(selectJmdictEntries('こう', [entry])).toEqual([])
  expect(selectJmdictEntries('甲', [entry])).toEqual([])
  expect(selectJmdictEntries('おつ', [entry])).toHaveLength(1)
  expect(selectJmdictEntries('乙', [entry])).toHaveLength(1)
  expect(selectJmdictEntries('かな', [entry])).toEqual([])
  entry.senses[0].readings = ['こう']
  expect(selectJmdictEntries('乙', [entry])).toEqual([])
  entry.senses[0].kanji = []
  entry.senses[0].readings = ['かな']
  expect(selectJmdictEntries('かな', [entry])).toHaveLength(1)
  expect(selectJmdictEntries('甲', [entry])).toEqual([])
})
