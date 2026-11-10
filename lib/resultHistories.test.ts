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
  sources: [{ name: 'wiktionary', url: 'https://en.wiktionary.org/wiki/bank' }],
}

describe('historyEntry', () => {
  test('defaults to the primary history and switches to a selected one', () => {
    expect(historyEntry(RESULT).definition).toBe('river')
    const selected = historyEntry(RESULT, 'money')
    expect(selected.definition).toBe('money')
    expect(selected.lore).toBe('money story')
    expect(selected.examples).toEqual(money.examples)
    expect(selected.partsOfSpeech).toEqual(money.partsOfSpeech)
    expect(selected.sources).toBe(RESULT.sources)
    expect('histories' in selected).toBe(false)
  })

  test('falls back to the primary history for an unknown selection', () => {
    expect(historyEntry(RESULT, 'missing').definition).toBe('river')
  })

  test('keeps a foreign-language example with its English gloss', () => {
    const examples = [
      { text: 'Hanno mantenuto la fede.', translation: 'They kept faith.' },
      { text: 'Una fede d’oro.', translation: 'A gold ring.' },
    ]
    const italian: EtymologyResult = {
      ...RESULT,
      language: 'it',
      word: 'fede',
      primaryHistoryId: 'faith',
      histories: [history('faith', examples)],
    }
    expect(historyEntry(italian).examples).toEqual(examples)
  })
})

describe('historyChoices', () => {
  test('lists every history with its parts of speech', () => {
    expect(historyChoices(RESULT)).toEqual([
      {
        id: 'river',
        label: 'river sense',
        entryKind: 'lemma',
        formOf: undefined,
        partsOfSpeech: ['noun'],
      },
      {
        id: 'money',
        label: 'money sense',
        entryKind: 'lemma',
        formOf: undefined,
        partsOfSpeech: ['noun'],
      },
    ])
  })
})
