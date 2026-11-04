import { expect, test } from 'bun:test'
import { sourceEtymologyAccounts } from './sourceComparison'
import { buildResearchPrompt } from './research'
import type { ResearchContext, SourceRecord } from './types'

test('keeps competing accounts and homograph boundaries visible without assigning histories', () => {
  const primaryPassage = 'Borrowed through English; recorded in 1771.'
  const specialistPassage = 'Recorded in 1684 and 1716; borrowed directly from Spanish.'
  const unrelatedPassage = 'A separate homograph borrowed from Latin.'
  const definitions = 'Definition and usage. '.repeat(1500)
  const sources: SourceRecord[] = [
    {
      provider: 'wiktionaryNative',
      sourceFamily: 'wiktionary',
      data: {
        text: `${primaryPassage}\n${definitions}`,
        url: 'https://fr.wiktionary.org/wiki/sample',
        lexicalLanguage: 'French',
        entryGroups: [
          {
            index: '1',
            number: '1',
            heading: 'Étymologie',
            anchor: 'Étymologie',
            level: 2,
            text: `${primaryPassage}\n${definitions}`,
            sections: [
              {
                index: '2',
                number: '1.1',
                heading: 'Nom commun',
                anchor: 'Nom_commun',
                level: 3,
                path: ['Nom commun'],
                text: definitions,
              },
            ],
          },
        ],
      },
    },
    {
      provider: 'tlfi',
      sourceFamily: 'tlfi',
      data: {
        text: `${specialistPassage}\n${definitions}\n${unrelatedPassage}`,
        url: 'https://www.cnrtl.fr/etymologie/sample',
        lexicalLanguage: 'French',
        entryGroups: [specialistPassage, unrelatedPassage].map((text, index) => ({
          index: String(index),
          number: String(index + 1),
          heading: `SAMPLE ${index + 1}`,
          anchor: `entry-${index}`,
          level: 2,
          text: `${text}\n${definitions}`,
          sections: [
            {
              index: `etymology-${index}`,
              number: '1',
              heading: 'Etymology',
              anchor: `etymology-${index}`,
              level: 3,
              path: ['Etymology'],
              text,
            },
          ],
        })),
      },
    },
  ]
  const accounts = sourceEtymologyAccounts(sources)
  expect(accounts).toHaveLength(3)
  expect(accounts.map((account) => account.passages.map((passage) => passage.text))).toEqual([
    [primaryPassage],
    [specialistPassage],
    [unrelatedPassage],
  ])
  expect(accounts.map((account) => account.entryAnchor)).toEqual([
    'Étymologie',
    'entry-0',
    'entry-1',
  ])
  expect(accounts.every((account) => !('historyId' in account))).toBe(true)
  const context: ResearchContext = {
    language: 'fr',
    mainWord: { word: 'sample', sources, etymonline: null, wiktionary: null },
    identifiedRoots: [],
    rootResearch: [],
    relatedResearch: [],
    totalSourcesFetched: 2,
  }
  const prompt = buildResearchPrompt(context)
  expect(prompt).toContain(definitions)
  const overview = prompt.slice(prompt.indexOf('=== Source-local Etymology Accounts'))
  expect(overview).toContain(primaryPassage)
  expect(overview).toContain(specialistPassage)
  expect(overview).toContain(unrelatedPassage)
  expect(overview).not.toContain(definitions)
})

test('senses-only and contextual sources do not become etymological accounts', () => {
  const data = {
    text: 'A definition.',
    url: 'https://example.org',
    entryGroups: [
      {
        index: '1',
        number: '1',
        heading: 'Etymology',
        anchor: 'etymology',
        level: 2,
        text: 'A definition.',
        sections: [],
      },
    ],
  }
  expect(
    sourceEtymologyAccounts([
      { provider: 'wikipedia', sourceFamily: 'wikipedia', data },
      { provider: 'academie', sourceFamily: 'academieFrancaise', data, evidenceRole: 'lexical' },
    ])
  ).toEqual([])
})
