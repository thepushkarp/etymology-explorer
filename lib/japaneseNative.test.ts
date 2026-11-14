import { expect, test } from 'bun:test'
import fixtures from './__fixtures__/japanese/native.json'
import { extractWiktionaryLanguage } from './wiktionary'
import { deriveEntryContexts } from './lexemeEntries'
import { ancestorCandidates, scopeEnglishHistories } from './research'
import { japaneseEtymologyRelations } from './japaneseEtymology'
import type { WiktionaryPage } from './wiktionary'
import type { ResearchContext } from './types'

test('numbered origins under a native POS retain independent evidence and enclosing headwords', () => {
  for (const [pos, siblingOrigin] of [
    ['名詞', '語源'],
    ['名詞:甲', '語源3'],
  ]) {
    const headings = ['日本語', pos, '語源1', '語源２', '名詞:乙', siblingOrigin, '翻訳']
    const levels = [2, 3, 4, 4, 3, 4, 4]
    const bodies = [
      '',
      '<p><strong class="headword" lang="ja">こう</strong><span class="headword-tr">kō</span></p><p>Shared noun context.</p>',
      '<p>古典日本語「かふ」から。</p>',
      '<p>上代日本語「こふ」から。</p>',
      '<p>Separate noun context.</p>',
      '<p>日本語「おつ」から。</p>',
      '<p>Unrelated translations.</p>',
    ]
    const page: WiktionaryPage = {
      requestedWord: 'こう',
      title: 'こう',
      redirects: [],
      fetchedAt: new Date().toISOString(),
      sections: headings.map((line, index) => ({
        line,
        index: String(index),
        number: String(index),
        anchor: `s${index}`,
        hLevel: levels[index],
      })),
      html: headings
        .map((line, i) => `<h${levels[i]} id="s${i}">${line}</h${levels[i]}>${bodies[i]}`)
        .join(''),
    }
    const data = extractWiktionaryLanguage(page, '日本語', 'ja')!
    const entries = deriveEntryContexts('こう', 'ja', 'wiktionaryNative', data, null)
    expect(entries).toHaveLength(3)
    expect(new Set(entries.map((entry) => entry.evidenceScopeId)).size).toBe(3)
    expect(
      data.entryGroups!.map((group) => group.relations?.map((relation) => relation.target.word))
    ).toEqual([['かふ'], ['こふ'], ['おつ']])
    for (const [index, other] of [
      [0, 'こふ'],
      [1, 'かふ'],
    ] as const) {
      expect(entries[index].text).toContain('Shared noun context.')
      expect(entries[index].text).not.toContain(other)
      expect(entries[index].text).not.toContain('Separate noun context.')
      expect(data.entryGroups![index].transliteration).toBe('kō')
    }
    expect(entries[2].text).not.toContain('Shared noun context.')
    expect(data.entryGroups![2].etymologyText).not.toContain('Unrelated translations.')
  }
})

test('native Japanese fallback preserves source-defined homographs and their local sections', () => {
  const data = extractWiktionaryLanguage(fixtures['はし'], '日本語', 'ja')!
  const entries = deriveEntryContexts('はし', 'ja', 'wiktionaryNative', data, null)
  expect(entries.map((entry) => entry.heading)).toEqual([
    '名詞:橋',
    '名詞:箸',
    '名詞:端',
    '名詞:嘴・喙・觜',
    '名詞:梯',
    '名詞:土師',
  ])
  expect(new Set(entries.map((entry) => entry.evidenceScopeId)).size).toBe(6)
  expect(entries[0].text).toContain('bridge')
  expect(entries[0].text).not.toContain('chopsticks')
  expect(entries[1].text).toContain('chopsticks')
  expect(entries[1].text).not.toContain('名詞:端')
})

test('a native etymology yields scoped ancestor research without parsing translation sections', () => {
  const data = extractWiktionaryLanguage(fixtures['ありがとう'], '日本語', 'ja')!
  const context: ResearchContext = {
    language: 'ja',
    mainWord: {
      word: 'ありがとう',
      etymonline: null,
      wiktionary: null,
      sources: [
        {
          provider: 'wiktionaryNative',
          sourceFamily: 'wiktionary',
          evidenceRole: 'etymology',
          data,
        },
      ],
    },
    identifiedRoots: [],
    rootResearch: [],
    relatedResearch: [],
    totalSourcesFetched: 0,
  }
  scopeEnglishHistories(context)
  expect(context.entryContexts).toHaveLength(1)
  expect(context.parsedChains).toHaveLength(1)
  expect(context.parsedChains![0]).toMatchObject({
    subject: { word: 'ありがとう', language: 'Japanese' },
    links: [{ form: 'ありがたし', language: 'Classical Japanese', relation: 'derived_from' }],
    evidenceScopeId: context.entryContexts![0].evidenceScopeId,
  })
  expect(ancestorCandidates(context).map((candidate) => candidate.lexeme)).toEqual([
    { word: 'ありがたし', language: 'Classical Japanese' },
  ])
})

test('native relationships reject uncertain, negated and comparative accounts', () => {
  const subject = { word: 'ありがとう', language: 'Japanese' }
  for (const text of [
    '古典日本語「ありがたし」からではない。',
    '古典日本語「ありがたし」からという説がある。',
    'おそらく古典日本語「ありがたし」から。',
    '古典日本語「ありがたし」と比較。',
    '「ありがたし」の略ではない。',
  ])
    expect(japaneseEtymologyRelations(text, subject)).toEqual([])
  expect(
    japaneseEtymologyRelations('「左様ならば…」のば以下が落ちて挨拶言葉となった。', {
      word: 'さようなら',
      language: 'Japanese',
    })[0].target
  ).toEqual({ word: '左様ならば', language: 'Japanese' })
})

test('unspaced etymology numbers and nested homograph etymologies retain their source scope', () => {
  const shiro = extractWiktionaryLanguage(fixtures['しろ'], '日本語', 'ja')!
  expect(shiro.entryGroups!.map((group) => group.heading)).toEqual([
    '語源1',
    '語源2',
    '語源3',
    '語源4',
    '語源5',
  ])
  const mamushi = extractWiktionaryLanguage(fixtures['まむし'], '日本語', 'ja')!
  expect(mamushi.entryGroups!.map((group) => group.heading)).toEqual(['名詞:鰻丼', '名詞:蝮'])
  expect(mamushi.entryGroups![0].etymologyText).toContain('飯蒸し')
  expect(mamushi.entryGroups![1].etymologyText).toBeUndefined()
  expect(mamushi.entryGroups![1].text).not.toContain('飯蒸し')
  expect(mamushi.entryGroups![0].relations).toBeUndefined()
})
