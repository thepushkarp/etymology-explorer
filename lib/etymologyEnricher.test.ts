import { describe, expect, test } from 'bun:test'
import { enrichAncestryGraph, pruneUngroundedStages } from '@/lib/etymologyEnricher'
import type { AncestryGraph, AncestryStage } from '@/lib/types'
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
