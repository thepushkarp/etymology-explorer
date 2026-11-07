import { describe, expect, test } from 'bun:test'
import { localizeResult } from './resultLocalization'
import type { BetaEtymologyResult, EnglishEtymologyResult, LexicalHistory } from './types'

function englishHistory(id: string, examples: string[]): LexicalHistory<string> {
  return {
    id,
    label: id,
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
  }
}

describe('localizeResult usage examples', () => {
  const english: EnglishEtymologyResult = {
    word: 'bank',
    pronunciation: '/bæŋk/',
    definition: 'river',
    roots: [],
    ancestryGraph: { branches: [] },
    lore: 'river story',
    examples: ['We sat on the bank.', 'Reeds lined the bank.'],
    sources: [],
    primaryHistoryId: 'river',
    histories: [
      englishHistory('river', ['We sat on the bank.', 'Reeds lined the bank.']),
      englishHistory('money', ['The bank opened at nine.', 'She banks online.']),
    ],
  }

  test('each history shows its own examples', () => {
    expect(localizeResult(english, 'en').examples).toEqual([
      { text: 'We sat on the bank.' },
      { text: 'Reeds lined the bank.' },
    ])
    expect(localizeResult(english, 'en', 'money').examples).toEqual([
      { text: 'The bank opened at nine.' },
      { text: 'She banks online.' },
    ])
  })

  test('legacy entries without examples render none', () => {
    const legacy = { ...english, examples: undefined, histories: undefined }
    expect(localizeResult(legacy, 'en').examples).toBeUndefined()
  })

  test('beta examples keep the local sentence and gloss it only in English', () => {
    const examples = [
      { en: 'They kept faith.', local: 'Hanno mantenuto la fede.' },
      { en: 'A gold ring.', local: 'Una fede d’oro.' },
    ]
    const beta = {
      language: 'it',
      word: 'fede',
      pronunciation: '/ˈfe.de/',
      definition: { en: 'faith', local: 'fiducia' },
      roots: [],
      ancestryGraph: { branches: [] },
      lore: { en: 'Story.', local: 'Storia.' },
      examples,
      sources: [],
      primaryHistoryId: 'faith',
      histories: [],
    } as unknown as BetaEtymologyResult
    expect(localizeResult(beta, 'local').examples).toEqual([
      { text: 'Hanno mantenuto la fede.', translation: undefined },
      { text: 'Una fede d’oro.', translation: undefined },
    ])
    expect(localizeResult(beta, 'en').examples).toEqual([
      { text: 'Hanno mantenuto la fede.', translation: 'They kept faith.' },
      { text: 'Una fede d’oro.', translation: 'A gold ring.' },
    ])
  })
})
