import { describe, expect, test } from 'bun:test'
import { enrichAncestryGraph, pruneUngroundedStages } from '@/lib/etymologyEnricher'
import type { AncestryGraph, AncestryStage, ResultText } from '@/lib/types'
import type { ParsedEtymChain } from '@/lib/etymologyParser'

const CHAINS: ParsedEtymChain[] = [
  {
    source: 'etymonline',
    word: 'bread',
    links: [
      {
        language: 'Old English',
        form: 'bread',
        isReconstructed: false,
        rawSnippet: 'from Old English bread',
      },
    ],
  },
]

test('confidence counts publisher families across editions and retrieval routes', () => {
  const stage: AncestryStage = { stage: 'Latin', form: 'fenestra', note: '' }
  const graph: AncestryGraph = { branches: [{ root: 'window', stages: [stage] }] }
  const chain: ParsedEtymChain = {
    source: 'wiktionary',
    word: 'window',
    links: [
      {
        language: 'Latin',
        form: 'fenestra',
        isReconstructed: false,
        rawSnippet: 'from Latin fenestra',
      },
    ],
  }
  const mirrors: ParsedEtymChain[] = [
    { ...chain, provider: 'wiktionaryEnglish' },
    { ...chain, provider: 'wiktionaryNative' },
  ]
  enrichAncestryGraph(graph, mirrors)
  expect(stage.confidence).toBe('medium')
  enrichAncestryGraph(graph, [...mirrors, { ...chain, source: 'deMauro', provider: 'deMauro' }])
  expect(stage.confidence).toBe('high')
  expect(stage.evidence?.map((evidence) => evidence.sourceFamily)).toContain('deMauro')
})

describe('enricher robustness against malformed LLM output', () => {
  test('drops convergence points missing pieRoot instead of crashing', () => {
    const graph: AncestryGraph = {
      branches: [
        {
          root: 'bread',
          stages: [
            { stage: 'Proto-Germanic', form: '*braudam', note: '' },
            { stage: 'Old English', form: 'bread', note: '' },
          ],
        },
      ],
      // The LLM sometimes emits convergence points without pieRoot; the
      // enricher runs BEFORE Zod validation and must tolerate that.
      convergencePoints: [
        { meaning: 'to brew', branchIndices: [0, 1] } as unknown as {
          pieRoot: string
          meaning: string
          branchIndices: number[]
        },
      ],
    }

    enrichAncestryGraph(graph, CHAINS)
    expect(() => pruneUngroundedStages(graph)).not.toThrow()
    expect(graph.convergencePoints).toEqual([])
  })

  test('tolerates stages with missing form and stage fields', () => {
    const malformedStage = { note: 'no form or stage' } as unknown as AncestryStage
    const graph: AncestryGraph = {
      branches: [{ root: 'bread', stages: [malformedStage] }],
    }

    expect(() => {
      enrichAncestryGraph(graph, CHAINS)
      pruneUngroundedStages(graph)
    }).not.toThrow()
  })
})

for (const note of ['name', { en: 'name', local: 'nome' }]) {
  test(`preserves orphaned post-merge lineage with ${typeof note === 'string' ? 'English' : 'bilingual'} prose`, () => {
    const graph: AncestryGraph<ResultText> = {
      branches: [
        { root: 'rik-', stages: [{ stage: 'Proto-Germanic', form: '*rik-', note }] },
        { root: '-hardu', stages: [{ stage: 'Proto-Germanic', form: '*hardu', note }] },
      ],
      mergePoint: { form: '*Rikuhardu', note },
      postMerge: [
        { stage: 'Old High German', form: 'Rihhart', note },
        { stage: 'English', form: 'Richard', note },
      ],
    }
    const chains: ParsedEtymChain[] = [
      {
        source: 'wiktionary',
        word: 'dick',
        links: [
          {
            language: 'Old High German',
            form: 'Rihhart',
            isReconstructed: false,
            rawSnippet: 'from Old High German Rihhart',
          },
        ],
      },
    ]
    enrichAncestryGraph(graph, chains)
    expect(pruneUngroundedStages(graph)).toBe(2)
    expect(graph.branches).toHaveLength(1)
    expect(graph.branches[0].root).toBe('Rihhart')
    expect(graph.branches[0].stages.map((stage) => stage.form)).toEqual(['Rihhart', 'Richard'])
    expect(graph.branches[0].stages[0].note).toEqual(note)
    expect(graph.branches[0].stages[0].confidence).toBe('medium')
    expect(graph.mergePoint).toBeUndefined()
    expect(graph.postMerge).toBeUndefined()
  })
}
