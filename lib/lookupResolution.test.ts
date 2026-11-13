import { afterEach, expect, spyOn, test } from 'bun:test'
import { japaneseReadings, resolveLookup } from './lookupResolution'
import { createLexemeResearchSession } from './lexemeResearch'
import { SourceFetchBudget } from './sourceFetchBudget'
import { extractWiktionaryLanguage } from './wiktionary'
import * as cache from './sourceCache'
import * as fallback from './lookupFallback'
import type { SourceData } from './types'

const originalFetch = globalThis.fetch
const restorers: Array<() => void> = []
afterEach(() => {
  globalThis.fetch = originalFetch
  restorers
    .splice(0)
    .reverse()
    .forEach((restore) => restore())
})
function source(word: string, reading = word, meaning = 'A dictionary meaning.'): SourceData {
  const data = extractWiktionaryLanguage(
    {
      requestedWord: word,
      title: word,
      redirects: [],
      revid: 42,
      fetchedAt: new Date().toISOString(),
      html: `<h2 id="Japanese">Japanese</h2><h3 id="Noun">Noun</h3><p><strong class="headword" lang="ja">${word}</strong> <span class="headword-tr">${reading}</span></p><ol><li>${meaning}</li></ol>`,
      sections: [
        { index: '1', line: 'Japanese', anchor: 'Japanese', hLevel: 2, number: '1' },
        { index: '2', line: 'Noun', anchor: 'Noun', hLevel: 3, number: '1.1' },
      ],
    },
    'Japanese'
  )!
  expect(data.spellingLemma).toBe(true)
  return data
}
function setup(entries: Record<string, SourceData>, discovered: string[] = [], more = false) {
  const spies = [
    spyOn(cache, 'getCachedSource').mockImplementation(async (key, word) =>
      key === 'wiktionaryLanguage:Japanese' ? (entries[word] ?? null) : null
    ),
    spyOn(cache, 'getCachedWiktionaryToc').mockResolvedValue(null),
    spyOn(cache, 'cacheWiktionaryToc').mockResolvedValue(undefined),
    spyOn(cache, 'cacheSource').mockResolvedValue(undefined),
  ]
  restorers.push(...spies.map((spy) => () => spy.mockRestore()))
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.searchParams.get('list') === 'search')
      return Response.json({
        query: { search: discovered.map((title) => ({ title })) },
        ...(more ? { continue: { sroffset: 5 } } : {}),
      })
    return Response.json({ error: { code: 'missingtitle' } })
  }) as typeof fetch
  return createLexemeResearchSession({ budget: new SourceFetchBudget(96), exaBudgetClient: null })
}

test('romanization variants preserve long vowels and do not fold unrelated Latin input', () => {
  expect(japaneseReadings('siro')).toEqual(japaneseReadings('shiro'))
  expect(japaneseReadings('kō')).toEqual(['こう', 'こお'])
  expect(japaneseReadings('ko')).toEqual(['こ'])
  expect(japaneseReadings('kû')).toEqual(['くう'])
  expect(japaneseReadings('xyz')).toEqual([])
})

test('unique rōmaji readings produce source proof, while homophones remain choices', async () => {
  const kodomo = source('こども', 'kodomo', 'child')
  const first = await resolveLookup('kodomo', setup({ こども: kodomo }), 'ja')
  expect(first.resolution?.selected).toMatchObject({
    word: 'こども',
    relationship: 'romanization',
    meaning: 'child',
  })
  expect(first.resolution?.selected?.provenance[0].sourceUrl).toContain('wiktionary.org')
  const reading = source('しろ')
  reading.spellingLemma = false
  reading.lookup!.hasIndependentEntry = false
  reading.lookup!.targets = ['白', '城'].map((word) => ({
    word,
    language: 'ja',
    relationship: 'spelling',
  }))
  const second = await resolveLookup(
    'shiro',
    setup({
      しろ: reading,
      白: source('白', 'shiro', 'white'),
      城: source('城', 'shiro', 'castle'),
    }),
    'ja'
  )
  expect(second.resolution?.candidates.map((candidate) => candidate.word)).toEqual(['白', '城'])
  expect(second.resolution?.selected).toBeUndefined()
})

test('kana and rōmaji conjugations resolve only through the lemma conjugation table', async () => {
  const lemma = source('たたかう', 'tatakau', 'fight')
  lemma.lookup!.forms = ['たたかえ']
  const session = setup({ たたかう: lemma }, ['たたかう'])
  for (const word of ['たたかえ', 'tatakae']) {
    const result = await resolveLookup(word, session, 'ja')
    expect(result.resolution?.selected).toMatchObject({ word: 'たたかう', relationship: 'form' })
    expect(result.resolution?.selected?.provenance[0].evidence).toContain('inflection table')
  }
})

test('independent exact histories survive a grammatical-form target, including through rōmaji', async () => {
  const headings = ['Japanese', 'Etymology 1', 'Verb', 'Etymology 2', 'Noun']
  const page = {
    requestedWord: 'しろ',
    title: 'しろ',
    redirects: [],
    fetchedAt: new Date().toISOString(),
    html: `<h2 id="Japanese">Japanese</h2><h3 id="Etymology_1">Etymology 1</h3><h4 id="Verb">Verb</h4><p><strong class="headword" lang="ja">しろ</strong><span class="headword-tr">shiro</span></p><ol><li><span class="form-of-definition">imperative of <span class="form-of-definition-link"><i lang="ja"><a href="/wiki/する#Japanese">する</a></i></span></span></li></ol><h3 id="Etymology_2">Etymology 2</h3><h4 id="Noun">Noun</h4><p><strong class="headword" lang="ja">しろ</strong></p><ol><li>A white area.</li></ol>`,
    sections: headings.map((line, index) => ({
      line,
      anchor: line.replace(' ', '_'),
      index: String(index),
      number: String(index),
      hLevel: [2, 3, 4, 3, 4][index],
    })),
  }
  const mixed = extractWiktionaryLanguage(page, 'Japanese')!
  expect(mixed.entryGroups).toHaveLength(2)
  expect(mixed.spellingLemma).toBe(false)
  expect(mixed.lookup?.targets).toEqual([{ word: 'する', language: 'ja', relationship: 'form' }])
  const session = setup({ しろ: mixed, する: source('する', 'suru', 'do') })
  const exact = await resolveLookup('しろ', session, 'ja')
  expect(exact.resolution?.selected).toBeUndefined()
  expect(exact.preserveExactEntry).toBe(true)
  expect(exact.resolution?.candidates.map(({ word }) => word)).toEqual(['する'])
  const roman = await resolveLookup('shiro', session, 'ja')
  expect(roman.resolution?.selected).toBeUndefined()
  expect(roman.resolution?.candidates.map(({ word }) => word)).toEqual(['しろ', 'する'])
  const formOnly = extractWiktionaryLanguage(
    {
      ...page,
      html: page.html.split('<h3 id="Etymology_2">')[0],
      sections: page.sections.slice(0, 3),
    },
    'Japanese'
  )!
  expect(formOnly.lookup?.hasIndependentEntry).toBe(false)
  const pure = await resolveLookup(
    'しろ',
    setup({ しろ: formOnly, する: source('する', 'suru', 'do') }),
    'ja'
  )
  expect(pure.resolution?.selected).toMatchObject({ word: 'する', relationship: 'form' })
})

test('Auto preserves English sayonara while Japanese selection reuses the verified native entry', async () => {
  const roman = source('sayonara')
  roman.spellingLemma = false
  roman.lookup!.hasIndependentEntry = false
  roman.lookup!.targets = [{ word: 'さよなら', language: 'ja', relationship: 'romanization' }]
  const session = setup({ sayonara: roman, さよなら: source('さよなら', 'sayonara', 'goodbye') })
  const toc = spyOn(cache, 'getCachedWiktionaryToc').mockImplementation(async (word) =>
    word === 'sayonara'
      ? { headings: ['English', 'Japanese'], nonemptyHeadings: ['English', 'Japanese'] }
      : null
  )
  restorers.push(() => toc.mockRestore())
  const automatic = await resolveLookup('sayonara', session)
  expect(automatic.resolution?.selected).toBeUndefined()
  expect(automatic.resolution?.candidates[0].word).toBe('さよなら')
  const japanese = await resolveLookup('sayonara', session, 'ja')
  expect(japanese.resolution?.selected?.word).toBe('さよなら')
  expect(japanese.originalTargets).toEqual([{ word: 'sayonara', language: 'en' }])
})

test('truncation, contradictory readings and unavailable candidates prevent automatic selection', async () => {
  const lemma = source('たたかう')
  lemma.lookup!.forms = ['たたかえ']
  expect(
    (await resolveLookup('たたかえ', setup({ たたかう: lemma }, ['たたかう'], true), 'ja'))
      .resolution?.selected
  ).toBeUndefined()
  const wrong = source('こども', 'different')
  wrong.lookup!.readings = ['different']
  expect(
    (await resolveLookup('kodomo', setup({ こども: wrong }), 'ja')).resolution?.selected
  ).toBeUndefined()
})

test('model proposals require reading or form evidence and cannot override known ambiguity', async () => {
  const proposal = spyOn(fallback, 'proposeLookup').mockResolvedValue([
    { word: 'たたかう', reading: 'tatakau', relationship: 'form' },
  ])
  restorers.push(() => proposal.mockRestore())
  const bad = await resolveLookup('たたかえ', setup({ たたかう: source('たたかう') }), 'ja')
  expect(bad.resolution?.candidates).toEqual([])
  const lemma = source('たたかう')
  lemma.lookup!.forms = ['たたかえ']
  const good = await resolveLookup('たたかえ', setup({ たたかう: lemma }), 'ja')
  expect(good.resolution?.selected?.relationship).toBe('form')
  expect(proposal).toHaveBeenCalledTimes(2)
})

test('conjugation parser excludes other-language tables and ordinary definition text', () => {
  const html =
    '<h2 id="Japanese">Japanese</h2><h3 id="Verb">Verb</h3><p><strong class="headword" lang="ja">たたかう</strong></p><ol><li>fight; example うそ</li></ol><h4 id="Conjugation">Conjugation</h4><table><tr><th>Imperative</th><td><span lang="ja">たたかえ</span></td></tr></table><h2 id="Other">Other</h2><h3 id="Declension">Declension</h3><table><tr><td><span lang="ja">うそ</span></td></tr></table>'
  const sections = ['Japanese', 'Verb', 'Conjugation', 'Other', 'Declension'].map(
    (line, index) => ({
      line,
      anchor: line,
      index: String(index),
      number: String(index),
      hLevel: [2, 3, 4, 2, 3][index],
    })
  )
  const result = extractWiktionaryLanguage(
    { requestedWord: 'たたかう', title: 'たたかう', redirects: [], html, sections },
    'Japanese'
  )
  expect(result?.lookup?.forms).toEqual(['たたかえ'])
})
