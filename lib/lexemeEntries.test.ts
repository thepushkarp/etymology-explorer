import { describe, expect, test } from 'bun:test'
import { deriveEntryContexts } from './lexemeEntries'
import type { SourceData } from './types'

const wiktionary: SourceData = {
  url: 'https://it.wiktionary.org/wiki/vite',
  text: 'Etimologia dal latino vītis. Sostantivo pianta. Forma flessa plurale di vita.',
  entryGroups: [
    {
      index: '1',
      number: '1',
      heading: 'Etimologia',
      anchor: 'Etimologia',
      level: 3,
      text: 'Etimologia dal latino vītis. Sostantivo pianta. Forma flessa plurale di vita.',
      sections: [
        {
          index: '2',
          number: '1.1',
          heading: 'Sostantivo',
          anchor: 'Sostantivo',
          level: 4,
          path: ['Sostantivo'],
          text: 'Sostantivo pianta.',
        },
        {
          index: '3',
          number: '1.2',
          heading: 'Forma flessa',
          anchor: 'Forma_flessa',
          level: 4,
          path: ['Forma flessa'],
          text: 'Forma flessa plurale di vita.',
        },
        {
          index: '4',
          number: '1.3',
          heading: 'Pronuncia',
          anchor: 'Pronuncia',
          level: 4,
          path: ['Pronuncia'],
          text: 'Pronuncia della forma plurale di vita e altri esempi.',
        },
      ],
    },
  ],
}

const wikidata: SourceData = {
  url: 'https://www.wikidata.org/wiki/L1189102',
  text: JSON.stringify({
    entities: {
      L1189102: {
        lemmas: { it: { language: 'it', value: 'vite' } },
      },
      L43224: {
        lemmas: { it: { language: 'it', value: 'vita' } },
        forms: [{ representations: { it: { language: 'it', value: 'vite' } } }],
      },
    },
  }),
}

describe('deriveEntryContexts', () => {
  test('uses structured lemma/form identity to split a same-spelling form history', () => {
    const contexts = deriveEntryContexts('vite', 'it', 'wiktionaryNative', wiktionary, wikidata)

    expect(contexts).toHaveLength(2)
    expect(contexts.map((context) => context.entryKind)).toEqual(['lemma', 'form'])
    expect(contexts[1].formOf).toEqual({ word: 'vita', language: 'it' })
    expect(contexts[0].text).not.toContain('plurale di vita')
    expect(contexts[0].evidenceScopeId).not.toBe(contexts[1].evidenceScopeId)
  })

  test('does not classify a form from localized heading text alone', () => {
    const contexts = deriveEntryContexts('vite', 'it', 'wiktionaryNative', wiktionary, null)
    expect(contexts).toHaveLength(1)
    expect(contexts[0].entryKind).toBe('unresolved')
  })

  test('splits source-explicit POS etymologies without interpreting their localized names', () => {
    const source: SourceData = {
      url: 'https://fr.wiktionary.org/wiki/fils',
      text: '(Nom commun 1) Du latin filius.\n(Nom commun 2) De fals.\nNom commun 1 fils.\nNom commun 2 monnaie.',
      entryGroups: [
        {
          index: '1',
          number: '1',
          heading: 'Étymologie',
          anchor: 'Etymologie',
          level: 3,
          text: '(Nom commun 1) Du latin filius.\n(Nom commun 2) De fals.\nNom commun 1 fils.\nNom commun 2 monnaie.',
          sections: [
            {
              index: '2',
              number: '1.1',
              heading: 'Nom commun 1',
              anchor: 'Nom_1',
              level: 4,
              path: ['Nom commun 1'],
              text: 'Nom commun 1 fils.',
            },
            {
              index: '3',
              number: '1.2',
              heading: 'Nom commun 2',
              anchor: 'Nom_2',
              level: 4,
              path: ['Nom commun 2'],
              text: 'Nom commun 2 monnaie.',
            },
          ],
        },
      ],
    }
    const identity: SourceData = {
      url: 'https://www.wikidata.org/wiki/L1',
      text: JSON.stringify({
        entities: { L1: { lemmas: { fr: { language: 'fr', value: 'fils' } } } },
      }),
    }

    const contexts = deriveEntryContexts('fils', 'fr', 'wiktionaryNative', source, identity)
    expect(contexts).toHaveLength(2)
    expect(contexts.map((context) => context.heading)).toEqual(['Nom commun 1', 'Nom commun 2'])
    expect(contexts[0].text).not.toContain('fals')
    expect(contexts[1].text).not.toContain('filius')
  })

  test('splits numbered etymology blocks inside an otherwise shared source group', () => {
    const source: SourceData = {
      url: 'https://pt.wiktionary.org/wiki/sede',
      text: '- Substantivo (1-2):\nDo latim sedes.\n- Substantivo (3-4):\nDo latim sitis.\nPronúncia',
      entryGroups: [
        {
          index: '1',
          number: '1',
          heading: 'Etimologia',
          anchor: 'Etimologia',
          level: 3,
          text: '- Substantivo (1-2):\nDo latim sedes.\n- Substantivo (3-4):\nDo latim sitis.\nPronúncia',
          sections: [
            {
              index: '2',
              number: '1.1',
              heading: 'Pronúncia',
              anchor: 'Pronuncia',
              level: 4,
              path: ['Pronúncia'],
              text: 'Pronúncia',
            },
          ],
        },
      ],
    }

    const contexts = deriveEntryContexts('sede', 'pt', 'wiktionaryNative', source, null)
    expect(contexts).toHaveLength(2)
    expect(contexts[0].text).toContain('sedes')
    expect(contexts[0].text).not.toContain('sitis')
    expect(contexts[1].text).toContain('sitis')
  })
})
