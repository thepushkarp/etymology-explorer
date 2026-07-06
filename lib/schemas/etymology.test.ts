import { describe, expect, test } from 'bun:test'
import { EtymologyResultSchema } from '@/lib/schemas/etymology'

/**
 * Known-good fixture mirroring a real post-enrichment pipeline result:
 * required core fields, a two-branch ancestry graph with merge point,
 * and the optional enrichment fields (isReconstructed, confidence, evidence).
 */
const KNOWN_GOOD_RESULT = {
  word: 'telephone',
  pronunciation: '/ˈtɛlɪfoʊn/',
  definition: 'A device that converts sound into electrical signals for transmission.',
  roots: [
    {
      root: 'tele',
      origin: 'Greek',
      meaning: 'far, at a distance',
      relatedWords: ['telegraph', 'television'],
      ancestorRoots: ['*kʷel-'],
      descendantWords: ['telepathy'],
    },
    {
      root: 'phone',
      origin: 'Greek',
      meaning: 'sound, voice',
      relatedWords: ['phonetic', 'symphony'],
    },
  ],
  ancestryGraph: {
    branches: [
      {
        root: 'tele',
        stages: [
          {
            stage: 'Proto-Indo-European',
            form: '*kʷel-',
            note: 'to turn, revolve',
            isReconstructed: true,
            confidence: 'medium',
            evidence: [{ source: 'wiktionary', snippet: 'from PIE *kʷel- "to turn"' }],
          },
          {
            stage: 'Ancient Greek',
            form: 'τῆλε',
            note: 'afar, far off',
            confidence: 'high',
            evidence: [
              { source: 'etymonline', snippet: 'from Greek tele- "far off"' },
              { source: 'wiktionary', snippet: 'from Ancient Greek τῆλε (têle)' },
            ],
          },
        ],
      },
      {
        root: 'phone',
        stages: [
          {
            stage: 'Ancient Greek',
            form: 'φωνή',
            note: 'sound, voice',
            confidence: 'high',
          },
        ],
      },
    ],
    convergencePoints: [
      {
        pieRoot: '*bʰeh₂-',
        meaning: 'to speak',
        branchIndices: [1],
      },
    ],
    mergePoint: {
      form: 'telephone',
      note: 'coined in the 19th century from Greek elements',
    },
    postMerge: [
      {
        stage: 'Modern English',
        form: 'telephone',
        note: 'popularized after Bell patented his device in 1876',
        confidence: 'high',
      },
    ],
  },
  lore: 'When Alexander Graham Bell needed a name for his talking machine, he reached back to Greek: tēle "far" and phōnē "voice" — literally a "far voice". The word had already been used for earlier acoustic devices, but Bell made it stick.',
  sources: [
    { name: 'etymonline', url: 'https://www.etymonline.com/word/telephone', word: 'telephone' },
    { name: 'wiktionary', url: 'https://en.wiktionary.org/wiki/telephone', word: 'telephone' },
  ],
  partsOfSpeech: [
    { pos: 'noun', definition: 'A telecommunications device.' },
    { pos: 'verb', definition: 'To call someone using a telephone.' },
  ],
  suggestions: {
    synonyms: ['phone'],
    seeAlso: ['telegraph', 'phonograph'],
  },
  modernUsage: {
    hasSlangMeaning: false,
  },
}

describe('EtymologyResultSchema', () => {
  test('parses a known-good etymology result', () => {
    const parsed = EtymologyResultSchema.safeParse(KNOWN_GOOD_RESULT)

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.word).toBe('telephone')
      expect(parsed.data.roots).toHaveLength(2)
      expect(parsed.data.ancestryGraph.branches[0]?.stages[0]?.isReconstructed).toBe(true)
      expect(parsed.data.ancestryGraph.branches[0]?.stages[1]?.confidence).toBe('high')
    }
  })

  test('preserves unknown fields for forward compatibility', () => {
    const withExtras = { ...KNOWN_GOOD_RESULT, futureField: 'kept' }
    const parsed = EtymologyResultSchema.safeParse(withExtras)

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).futureField).toBe('kept')
    }
  })

  test('rejects a result missing required core fields', () => {
    const withoutLore: Record<string, unknown> = { ...KNOWN_GOOD_RESULT }
    delete withoutLore.lore
    expect(EtymologyResultSchema.safeParse(withoutLore).success).toBe(false)
  })

  test('rejects an invalid confidence value', () => {
    const invalid = structuredClone(KNOWN_GOOD_RESULT) as Record<string, unknown>
    const graph = invalid.ancestryGraph as {
      branches: Array<{ stages: Array<{ confidence?: string }> }>
    }
    graph.branches[0]!.stages[0]!.confidence = 'certain'

    expect(EtymologyResultSchema.safeParse(invalid).success).toBe(false)
  })
})
