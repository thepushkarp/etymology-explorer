import { describe, expect, test } from 'bun:test'
import { assembleLookupGroup, lookupGroupSeed } from './lookupGroups'
import { etymologyResult } from './testSupport/etymologyResult'
import type { WordEntry, EtymologyResult } from './types'

function entry(result: EtymologyResult): WordEntry {
  return {
    word: result.word,
    entries: { [result.language]: result },
    languages: [result.language],
    otherLanguages: [],
    revision: 6,
    tracedAt: '2026-11-13T00:00:00Z',
  }
}

const kana = entry(etymologyResult({ word: 'しろ', language: 'ja', definition: 'Do!' }))
kana.entries.ja!.histories[0].transliteration = 'shiro'
kana.entries.ja!.histories.push({
  ...kana.entries.ja!.histories[0],
  id: 'index',
  entryKind: 'unresolved',
  counterparts: [
    { word: '白', language: 'ja' },
    { word: '城', language: 'ja', meaning: 'castle' },
  ],
})
const white = entry(etymologyResult({ word: '白', language: 'ja', definition: 'White' }))
white.entries.ja!.histories[0].transliteration = 'shiro'
white.entries.ja!.histories.push({
  ...white.entries.ja!.histories[0],
  id: 'haku',
  transliteration: 'haku',
})

describe('source-backed lookup navigation', () => {
  test('a single kana form retains a confirmed English return tab, never a guessed one', () => {
    const japanese = entry(
      etymologyResult({ word: 'まむし', language: 'ja', transliteration: 'mamushi' })
    )
    japanese.entries.ja!.histories[0].transliteration = 'mamushi'
    const english = entry(etymologyResult({ word: 'mamushi', language: 'en' }))
    const seed = lookupGroupSeed(japanese)!
    expect(seed.members).toEqual([{ word: 'まむし', language: 'ja' }])
    expect(seed.romanizations).toEqual(['mamushi'])
    expect(assembleLookupGroup(seed, [japanese, english]).languages).toEqual([
      { word: 'まむし', language: 'ja' },
    ])
    english.otherScripts = [{ word: 'まむし', language: 'ja' }]
    const group = assembleLookupGroup(seed, [japanese, english])
    expect(group.languages).toContainEqual({ word: 'mamushi', language: 'en' })
    expect(group.choices.map(({ word, historyId }) => [word, historyId])).toEqual([
      ['まむし', japanese.entries.ja!.primaryHistoryId],
    ])
    english.otherScripts = [{ word: 'むし', language: 'ja' }]
    expect(assembleLookupGroup(seed, [japanese, english]).languages).toHaveLength(1)
  })

  test('separates homophones, excludes the index wrapper, and scopes a kanji to its matching reading', () => {
    const seed = lookupGroupSeed(kana)!
    const group = assembleLookupGroup(seed, [kana, white])
    expect(group.choices.map((choice) => [choice.word, choice.historyId])).toEqual([
      ['しろ', kana.entries.ja!.primaryHistoryId],
      ['白', white.entries.ja!.primaryHistoryId],
    ])
    expect(group.members.some((member) => member.word === '城')).toBe(true)
    expect(group.choices.some((choice) => choice.word === '城')).toBe(false)
    expect(white.entries.ja!.histories).toHaveLength(2)
    expect(lookupGroupSeed(white)).toBeUndefined()
  })

  test('retains every matching history beyond four, ranks verified matches first and excludes other readings', () => {
    const index = entry(etymologyResult({ word: 'こう', language: 'ja' }))
    const words = ['甲', '校', '工', '公', '高', '光']
    index.entries.ja!.histories[0].transliteration = 'kō'
    index.entries.ja!.histories[0].counterparts = words.map((word) => ({ word, language: 'ja' }))
    const seed = lookupGroupSeed(index)!
    const results = words.map((word) => {
      const saved = entry(etymologyResult({ word, language: 'ja' }))
      saved.entries.ja!.histories[0].transliteration = word === '甲' ? 'kabuto' : 'kō'
      return saved
    })
    const group = assembleLookupGroup(seed, [index, ...results])
    expect(seed.members.map((member) => member.word)).toEqual(['こう', ...words])
    expect(group.choices.map((choice) => choice.word)).toEqual(['こう', ...words.slice(1)])
    expect(group.members.map((member) => [member.word, member.lookupSupport])).toEqual([
      ...['こう', ...words.slice(1)].map((word) => [word, 'verified']),
      ['甲', 'linked'],
    ])
  })

  test('a saved source link admits reverse navigation without requiring an ancestry graph', () => {
    const english = entry(etymologyResult({ word: 'shiro', language: 'en' }))
    const seed = lookupGroupSeed(kana)!
    expect(assembleLookupGroup(seed, [kana, english]).languages).toEqual([
      { word: 'しろ', language: 'ja' },
    ])
    english.otherScripts = [{ word: 'しろ', language: 'ja' }]
    expect(assembleLookupGroup(seed, [kana, english]).languages).toContainEqual({
      word: 'shiro',
      language: 'en',
    })
  })

  test('verified aliases do not become duplicate meaning choices', () => {
    const alias = {
      ...kana,
      spellings: [
        {
          word: '白',
          language: 'ja' as const,
          kind: 'spelling' as const,
          sourceUrl: 'https://en.wiktionary.org/wiki/しろ',
          verifiedAt: '2026-11-13T00:00:00Z',
        },
      ],
    }
    expect(lookupGroupSeed(alias)?.members.map((member) => member.word)).toEqual(['しろ', '城'])
  })
})
