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
  test('separates homophones, excludes the index wrapper, and scopes a kanji to its matching reading', () => {
    const seed = lookupGroupSeed(kana)!
    const group = assembleLookupGroup(seed, [kana, white])
    expect(group.choices.map((choice) => [choice.word, choice.historyId])).toEqual([
      ['しろ', kana.entries.ja!.primaryHistoryId],
      ['白', white.entries.ja!.primaryHistoryId],
      ['城', undefined],
    ])
    expect(group.choices.at(-1)?.label).toBe('城 — castle')
    expect(white.entries.ja!.histories).toHaveLength(2)
    expect(lookupGroupSeed(white)).toBeUndefined()
  })

  test('a romanization alone cannot add an unrelated English language tab', () => {
    const english = entry(etymologyResult({ word: 'shiro', language: 'en' }))
    const seed = lookupGroupSeed(kana)!
    expect(assembleLookupGroup(seed, [kana, english]).languages).toEqual([
      { word: 'しろ', language: 'ja' },
    ])
    english.otherScripts = [{ word: 'しろ', language: 'ja' }]
    english.entries.en!.histories[0].ancestryGraph = {
      branches: [{ root: 'shiro', stages: [{ stage: 'Japanese', form: 'しろ', note: '' }] }],
    }
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
