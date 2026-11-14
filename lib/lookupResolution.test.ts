import { afterEach, expect, spyOn, test } from 'bun:test'
import { japaneseReadings, resolveLookup } from './lookupResolution'
import { createLexemeResearchSession } from './lexemeResearch'
import { SourceFetchBudget } from './sourceFetchBudget'
import { extractWiktionaryLanguage } from './wiktionary'
import * as cache from './sourceCache'
import * as fallback from './lookupFallback'
import type { SourceData } from './types'
import conjugationCells from './__fixtures__/japanese/conjugation-cells.json'

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

test('recorded multi-form cells and footnotes resolve native and rōmaji inflections', async () => {
  for (const fixture of conjugationCells) {
    const html = `<h2 id="Japanese">Japanese</h2><h3 id="Verb">Verb</h3><p><strong class="headword" lang="ja">${fixture.word}</strong></p><ol><li>A verb.</li></ol><h4 id="Conjugation">Conjugation</h4><table><tr>${fixture.cells.join('')}</tr></table>`
    const lemma = extractWiktionaryLanguage(
      {
        requestedWord: fixture.word,
        title: fixture.word,
        redirects: [],
        html,
        revid: fixture.revisionId,
        fetchedAt: new Date().toISOString(),
        sections: ['Japanese', 'Verb', 'Conjugation'].map((line, index) => ({
          line,
          anchor: line,
          index: String(index),
          number: String(index),
          hLevel: index + 2,
        })),
      },
      'Japanese'
    )!
    const session = setup({ [fixture.word]: lemma }, [fixture.word])
    const inputs =
      fixture.word === 'たたかう'
        ? ['たたかわせる', 'tatakawaseru', 'たたかわす', 'tatakawasu']
        : ['化身しろ', 'keshinshiro', 'けしんせよ', 'keshinseyo']
    for (const input of inputs) {
      const result = await resolveLookup(input, session, 'ja')
      expect(result.resolution?.selected).toMatchObject({
        word: fixture.word,
        relationship: 'form',
      })
      expect(result.resolution?.selected?.provenance[0].revisionId).toBe(fixture.revisionId)
    }
  }
})

test('all source-backed homophones remain candidates beyond four without claiming uniqueness', async () => {
  const index = source('はし')
  index.spellingLemma = false
  index.lookup!.hasIndependentEntry = false
  index.lookup!.targets = ['階', '端', '嘴', '箸', '橋'].map((word) => ({
    word,
    language: 'ja',
    relationship: 'spelling',
  }))
  const entries = Object.fromEntries(
    index.lookup!.targets.map(({ word }) => [word, source(word, 'hashi')])
  )
  const result = await resolveLookup('hashi', setup({ ...entries, はし: index }), 'ja')
  expect(result.verifiedCount).toBe(6)
  expect(result.resolution?.candidates.map(({ word }) => word)).toEqual([
    '階',
    '端',
    '嘴',
    '箸',
    '橋',
  ])
  expect(result.resolution?.sourceListed).toBeUndefined()
  expect(result.resolution?.selected).toBeUndefined()
  expect(result.resolution?.incomplete).toBeFalsy()
})

test('HTTP exhaustion retains unchecked source links and cannot establish a unique match', async () => {
  const index = source('はし')
  index.spellingLemma = false
  index.lookup!.hasIndependentEntry = false
  index.lookup!.targets = ['箸', '橋', '端'].map((word) => ({
    word,
    language: 'ja',
    relationship: 'spelling',
  }))
  const session = setup({ はし: index, 箸: source('箸', 'hashi') })
  session.getBudget().tighten(1)
  const warnings = spyOn(console, 'warn').mockImplementation(() => {})
  restorers.push(() => warnings.mockRestore())
  const result = await resolveLookup('hashi', session, 'ja')
  expect(session.getBudget().attempts).toBe(1)
  expect(result.resolution?.candidates.map((candidate) => candidate.word)).toEqual(['箸'])
  expect(result.resolution?.sourceListed?.map((candidate) => candidate.word)).toEqual(['橋', '端'])
  expect(result.resolution?.incomplete).toBe(true)
  expect(result.resolution?.selected).toBeUndefined()
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
  expect(exact.resolution?.sourceListed?.map(({ word }) => word)).toEqual(['する'])
  expect(exact.verifiedCount).toBe(0)
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
  expect(automatic.resolution?.sourceListed?.[0].word).toBe('さよなら')
  expect(automatic.verifiedCount).toBe(0)
  const japanese = await resolveLookup('sayonara', session, 'ja')
  expect(japanese.resolution?.selected?.word).toBe('さよなら')
  expect(japanese.originalTargets).toEqual([{ word: 'sayonara', language: 'en' }])
})

test('optional fanout preserves every source link without spending the primary HTTP budget', async () => {
  const roman = source('kou')
  roman.spellingLemma = false
  roman.lookup!.hasIndependentEntry = false
  roman.lookup!.targets = Array.from({ length: 40 }, (_, index) => ({
    word: String.fromCodePoint(0x4e00 + index),
    language: 'ja' as const,
    relationship: 'romanization' as const,
  }))
  const session = setup({ kou: roman })
  const toc = spyOn(cache, 'getCachedWiktionaryToc').mockResolvedValue({
    headings: ['English', 'Japanese'],
    nonemptyHeadings: ['English', 'Japanese'],
  })
  restorers.push(() => toc.mockRestore())
  const result = await resolveLookup('kou', session)
  expect(session.getBudget().attempts).toBe(0)
  expect(result.resolution?.sourceListed).toHaveLength(40)
  expect(result.resolution?.incomplete).toBeFalsy()
  expect(result.resolution?.selected).toBeUndefined()
})

test('Auto retains Romance entries alongside ambiguous Japanese romanizations', async () => {
  const roman = source('ame')
  roman.spellingLemma = false
  roman.lookup!.hasIndependentEntry = false
  roman.lookup!.targets = [{ word: 'あめ', language: 'ja', relationship: 'romanization' }]
  const kana = source('あめ')
  kana.spellingLemma = false
  kana.lookup!.hasIndependentEntry = false
  kana.lookup!.targets = ['雨', '飴'].map((word) => ({
    word,
    language: 'ja',
    relationship: 'spelling',
  }))
  const session = setup({
    ame: roman,
    あめ: kana,
    雨: source('雨', 'ame', 'rain'),
    飴: source('飴', 'ame', 'candy'),
  })
  const toc = spyOn(cache, 'getCachedWiktionaryToc').mockImplementation(async (word) =>
    word === 'ame'
      ? {
          headings: ['Spanish', 'Portuguese', 'Japanese'],
          nonemptyHeadings: ['Spanish', 'Portuguese', 'Japanese'],
        }
      : null
  )
  restorers.push(() => toc.mockRestore())
  const result = await resolveLookup('ame', session)
  expect(result.originalTargets).toEqual([
    { word: 'ame', language: 'es' },
    { word: 'ame', language: 'pt' },
  ])
  expect(result.resolution?.sourceListed?.map(({ word }) => word)).toEqual(['あめ'])
  expect(result.verifiedCount).toBe(0)
  expect(result.resolution?.selected).toBeUndefined()
  expect(result.resolution?.incomplete).toBeFalsy()
})

test('truncation, contradictory readings and unavailable candidates prevent automatic selection', async () => {
  const lemma = source('たたかう')
  lemma.lookup!.forms = ['たたかえ']
  const truncated = await resolveLookup(
    'たたかえ',
    setup({ たたかう: lemma }, ['たたかう'], true),
    'ja'
  )
  expect(truncated.resolution?.selected).toBeUndefined()
  expect(truncated.resolution?.sourceListed).toBeUndefined()
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

test('one model-proposed homophone is a choice, never proof of unique romanization', async () => {
  const proposal = spyOn(fallback, 'proposeLookup').mockResolvedValue([
    { word: '白', reading: 'shiro', relationship: 'romanization' },
  ])
  restorers.push(() => proposal.mockRestore())
  const result = await resolveLookup('shiro', setup({ 白: source('白', 'shiro') }), 'ja')
  expect(result.resolution?.candidates.map(({ word }) => word)).toEqual(['白'])
  expect(result.resolution?.selected).toBeUndefined()
  expect(result.terminal).toBeUndefined()
  proposal.mockResolvedValue([{ word: '白', reading: 'shiro', relationship: 'form' }])
  const falseForm = await resolveLookup('shiro', setup({ 白: source('白', 'shiro') }), 'ja')
  expect(falseForm.resolution?.candidates).toEqual([])
})

test('conjugation parser excludes other-language tables and ordinary definition text', () => {
  const html =
    '<h2 id="Japanese">Japanese</h2><h3 id="Verb">Verb</h3><p><strong class="headword" lang="ja">たたかう</strong></p><ol><li>fight; example うそ</li></ol><h4 id="Conjugation">Conjugation</h4><table><tr><th>Imperative</th><td><span lang="ja"><span>たたかえ</span><sup>1</sup><br /><ruby>戦<rt>たたか</rt></ruby>って ください<sup class="reference">[2]</sup></span></td></tr></table><h2 id="Other">Other</h2><h3 id="Declension">Declension</h3><table><tr><td><span lang="ja">うそ</span></td></tr></table>'
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
  expect(result?.lookup?.forms).toEqual(['たたかえ', '戦って ください'])
})
