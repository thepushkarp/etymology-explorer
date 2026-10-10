import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EntrySelector } from '@/components/etymology-card/EntrySelector'
import { localizeHistoryChoices, localizeResult } from './resultLocalization'
import type { EnglishEtymologyResult, LexicalHistory } from './types'

const histories: LexicalHistory<string>[] = [
  ['name', 'Richard nickname'],
  ['detective', 'Detective'],
  ['declaration', 'Declaration'],
  ['counting', 'Counting-out term'],
].map(([id, label]) => ({
  id,
  label,
  entryKind: 'lemma',
  queryNodeId: `query:${id}`,
  lemmaNodeId: `query:${id}`,
  evidenceScopeIds: [`wiktionary:history:${id}`],
  pronunciation: '/dɪk/',
  definition: label,
  roots: [],
  ancestryGraph: {
    branches: [
      {
        root: id,
        stages: [
          {
            stage: 'English',
            form: id,
            note: `${label} evidence`,
            evidence: [{ source: 'wiktionary', snippet: `${label} source text` }],
          },
        ],
      },
    ],
  },
  lore: `${label} history.`,
  partsOfSpeech: [{ pos: 'noun', definition: label }],
}))

const result: EnglishEtymologyResult = {
  word: 'dick',
  pronunciation: '/dɪk/',
  definition: 'Primary entry',
  roots: [],
  ancestryGraph: { branches: [] },
  lore: 'Primary story.',
  sources: [{ name: 'wiktionary', url: 'https://en.wiktionary.org/wiki/dick' }],
  primaryHistoryId: 'name',
  histories,
}

describe('English history display', () => {
  test('projects only the selected history while preserving string prose and source identity', () => {
    for (const history of histories) {
      const display = localizeResult(result, 'en', history.id)
      expect(display.definition).toBe(history.definition)
      expect(display.lore).toBe(history.lore)
      expect(display.partsOfSpeech).toBe(history.partsOfSpeech)
      expect(display.ancestryGraph).toBe(history.ancestryGraph)
      expect(display.sources).toBe(result.sources)
      expect(display.ancestryGraph.branches).toHaveLength(1)
      expect(display.ancestryGraph.branches[0].stages[0].evidence?.[0].source).toBe('wiktionary')
    }
    expect(localizeResult(result).definition).toBe('Richard nickname')
    expect(localizeResult(result, 'en', 'missing').definition).toBe('Richard nickname')
  })

  test('uses the existing selector with meaningful English labels', () => {
    const choices = localizeHistoryChoices(result)
    const markup = renderToStaticMarkup(
      <EntrySelector word="dick" entries={choices} activeEntryId="detective" onChange={() => {}} />
    )
    expect(choices.map((choice) => choice.label)).toEqual(histories.map((history) => history.label))
    expect(markup.match(/role="tab"/g)).toHaveLength(4)
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(markup).toContain('History 2 of 4, noun, Detective')
  })

  test('keeps legacy and progressive English entries displayable without histories', () => {
    const legacy = { ...result, primaryHistoryId: undefined, histories: undefined }
    expect(localizeResult(legacy).definition).toBe('Primary entry')
    expect(localizeResult(legacy).language).toBe('en')
    expect(localizeHistoryChoices(legacy)).toEqual([])
  })
})
