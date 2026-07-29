import { describe, expect, test } from 'bun:test'
import { buildLexicalResearchGraph, hasAncestryCycle } from './lexemeGraph'
import type { ParsedEtymChain } from './etymologyParser'
import type { ResearchEntryContext } from './types'

const contexts: ResearchEntryContext[] = [
  {
    id: 'it:vite:lemma',
    source: 'wiktionaryNative',
    heading: 'Etimologia',
    text: 'dal latino vītis',
    sectionHeadings: ['Sostantivo'],
    evidenceScopeId: 'native:vite:lemma',
    sourceUrl: 'https://it.wiktionary.org/wiki/vite',
    entryKind: 'lemma',
  },
  {
    id: 'it:vite:form',
    source: 'wiktionaryNative',
    heading: 'Forma flessa',
    text: 'plurale di vita',
    sectionHeadings: ['Forma flessa'],
    evidenceScopeId: 'native:vite:form',
    sourceUrl: 'https://it.wiktionary.org/wiki/vite',
    entryKind: 'form',
    formOf: { word: 'vita', language: 'it' },
  },
]

const chains: ParsedEtymChain[] = [
  {
    source: 'wiktionary',
    provider: 'wiktionaryNative',
    word: 'vite',
    historyId: 'it:vite:lemma',
    evidenceScopeId: 'native:vite:lemma',
    links: [
      {
        language: 'Latin',
        form: 'vītis',
        isReconstructed: false,
        rawSnippet: 'from Latin vītis',
      },
    ],
  },
]

describe('buildLexicalResearchGraph', () => {
  test('keeps ancestry evidence scoped and form-of edges non-chronological', () => {
    const graph = buildLexicalResearchGraph('vite', 'it', contexts, chains)
    const lemma = graph.histories.find((history) => history.id === 'it:vite:lemma')
    const form = graph.histories.find((history) => history.id === 'it:vite:form')
    const formEdge = Object.values(graph.edges).find((edge) => edge.relation === 'form_of')

    expect(lemma?.evidenceScopeIds).toEqual(['native:vite:lemma'])
    expect(form?.edgeIds).toContain(formEdge?.id as string)
    expect(formEdge?.role).toBe('morphology')
    expect(Object.values(graph.evidence)[0].evidenceScopeId).toBe('native:vite:lemma')
    expect(hasAncestryCycle(graph)).toBe(false)
  })
})
