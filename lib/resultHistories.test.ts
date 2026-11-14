import { describe, expect, test } from 'bun:test'
import { historyChoices, historyEntry } from './resultHistories'
import type { EtymologyResult, LexicalHistory, UsageExample } from './types'

function history(id: string, examples: UsageExample[]): LexicalHistory {
  return {
    id,
    label: `${id} sense`,
    entryKind: 'lemma',
    queryNodeId: `query:${id}`,
    lemmaNodeId: `query:${id}`,
    evidenceScopeIds: [`scope:${id}`],
    pronunciation: '/bæŋk/',
    definition: id,
    roots: [],
    ancestryGraph: { branches: [] },
    lore: `${id} story`,
    examples,
    partsOfSpeech: [{ pos: 'noun', definition: id }],
  }
}

const river = history('river', [{ text: 'We sat on the bank.' }, { text: 'Reeds lined the bank.' }])
const money = history('money', [
  { text: 'The bank opened at nine.' },
  { text: 'She banks online.' },
])

const RESULT: EtymologyResult = {
  language: 'en',
  word: 'bank',
  primaryHistoryId: 'river',
  histories: [river, money],
  pronunciation: '/bæŋk/',
  definition: 'river',
  roots: [],
  ancestryGraph: { branches: [] },
  lore: 'river story',
  examples: river.examples,
  partsOfSpeech: river.partsOfSpeech,
  sources: [{ name: 'wiktionary', word: 'bank', url: 'https://en.wiktionary.org/wiki/bank' }],
}

describe('historyEntry', () => {
  test('defaults to the primary history and switches to a selected one', () => {
    expect(historyEntry(RESULT).definition).toBe('river')
    const selected = historyEntry(RESULT, 'money')
    expect(selected.definition).toBe('money')
    expect(selected.lore).toBe('money story')
    expect(selected.examples).toEqual(money.examples)
    expect(selected.partsOfSpeech).toEqual(money.partsOfSpeech)
    expect(selected.sources).toEqual(RESULT.sources)
    expect('histories' in selected).toBe(false)
  })

  test('projects the selected reading and clears an absent sibling reading', () => {
    const result = structuredClone(RESULT)
    result.transliteration = 'primary reading'
    result.histories[0].transliteration = 'primary reading'
    expect(historyEntry(result).transliteration).toBe('primary reading')
    expect(historyEntry(result, 'money').transliteration).toBeUndefined()
  })

  test('scopes saved source links to the selected forms and explicit research owners', () => {
    const result = structuredClone(RESULT)
    result.histories[0].roots = [
      { root: 'banki', origin: 'Old Norse', meaning: 'bank', relatedWords: ['embankment'] },
    ]
    result.sources.push(
      { name: 'wiktionary', word: 'banki', url: 'https://en.wiktionary.org/wiki/banki' },
      { name: 'etymonline', word: 'banca', historyIds: ['money'] },
      { name: 'wiktionary', word: 'embankment' },
      { name: 'wiktionary', word: 'unrelated' }
    )
    expect(historyEntry(result, 'river').sources.map((source) => source.word)).toEqual([
      'bank',
      'banki',
      'embankment',
    ])
    expect(historyEntry(result, 'money').sources.map((source) => source.word)).toEqual([
      'bank',
      'banca',
    ])
  })

  test('projects counterparts only for the selected history', () => {
    const result = structuredClone(RESULT)
    result.counterparts = [{ word: 'کتاب', language: 'ur' }]
    result.histories[0].counterparts = result.counterparts
    expect(historyEntry(result).counterparts).toEqual(result.counterparts)
    expect(historyEntry(result, 'money').counterparts).toBeUndefined()
  })

  test('falls back to the primary history for an unknown selection', () => {
    expect(historyEntry(RESULT, 'missing').definition).toBe('river')
  })
})

describe('historyChoices', () => {
  test('lists every history with its parts of speech', () => {
    expect(historyChoices(RESULT)).toEqual([
      {
        id: 'river',
        label: 'river sense',
        details: 'noun',
      },
      {
        id: 'money',
        label: 'money sense',
        details: 'noun',
      },
    ])
  })
})
