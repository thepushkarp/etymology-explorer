import { describe, expect, test } from 'bun:test'
import type { LearnerEtymologyResult, LexemeCandidate, ResearchContext } from '@/lib/types'
import { LearnerEtymologyResultSchema } from '@/lib/schemas/etymology'
import { buildJapaneseLexicalOnlyResult, finalizeGroundedResult } from './synthesis'

const candidate: LexemeCandidate = {
  entryId: '1206730',
  lemma: '学校',
  reading: 'がっこう',
  romaji: 'gakkou',
  partOfSpeech: ['noun'],
  gloss: 'school',
  common: true,
  matchType: 'exact',
  matchExplanation: 'exact dictionary spelling',
  alternateForms: ['がっこう'],
}

function context(evidence?: string): ResearchContext {
  return {
    language: 'ja',
    mainWord: {
      word: candidate.lemma,
      etymonline: null,
      wiktionary: null,
      jmdict: { text: '{}', url: 'https://www.edrdg.org/' },
      wold: evidence ? { text: evidence, url: 'https://wold.clld.org/vocabulary/21' } : null,
    },
    identifiedRoots: [],
    rootResearch: [],
    relatedResearch: [],
    totalSourcesFetched: evidence ? 2 : 1,
    japaneseCandidate: candidate,
  }
}

describe('Japanese result evidence gating', () => {
  test('returns a deterministic lexical-only result when origin evidence is absent', () => {
    const result = buildJapaneseLexicalOnlyResult(context())
    expect(result.evidenceState).toBe('lexical_only')
    expect(result.originSummary).toContain('Reliable origin evidence was not found')
    expect(result.formation.kind).toBe('opaque')
    expect(LearnerEtymologyResultSchema.safeParse(result).success).toBe(true)
  })

  test('prunes reconstructed histories and unsupported kanji decomposition', () => {
    const generated = {
      ...buildJapaneseLexicalOnlyResult(context()),
      evidenceState: 'grounded',
      lexicalStratum: 'sino-japanese',
      originSummary: 'A source-backed formation.',
      formation: {
        kind: 'compound',
        parts: [
          { form: '学', meaning: 'study', role: 'component' },
          { form: '校', meaning: 'school', role: 'component' },
        ],
        result: '学校',
        note: 'An unsupported visual decomposition.',
      },
      ancestryGraph: {
        branches: [
          {
            root: 'guess',
            stages: [{ stage: 'Proto-Japonic', form: '*gaku', note: 'unsupported reconstruction' }],
          },
        ],
      },
    } as LearnerEtymologyResult

    const result = finalizeGroundedResult(generated, context('{"stratum":"kango"}'))
    expect(result.formation.kind).toBe('opaque')
    expect(result.ancestryGraph.branches).toEqual([])
    expect(result.lexicalStratum).toBe('sino-japanese')
  })
})
