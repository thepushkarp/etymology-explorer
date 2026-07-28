import { describe, expect, test } from 'bun:test'
import { buildBetaSystemPrompt } from './prompts'
import { localizeResult } from './resultLocalization'
import { BetaEtymologyResultSchema } from './schemas/etymology'
import type { BetaEtymologyResult } from './types'
import { hasCredibleMainSource } from './research'

const pair = (en: string, local: string) => ({ en, local })
const RESULT: BetaEtymologyResult = {
  language: 'it',
  word: 'casa',
  pronunciation: '/ˈka.za/',
  definition: pair('house', 'abitazione'),
  roots: [{ root: 'casa', origin: 'Latin', meaning: pair('hut', 'capanna'), relatedWords: [] }],
  ancestryGraph: {
    branches: [
      {
        root: 'casa',
        stages: [{ stage: 'Latin', form: 'casa', note: pair('a hut', 'una capanna') }],
      },
    ],
  },
  lore: pair('A humble hut became a home.', 'Una modesta capanna divenne una casa.'),
  sources: [{ name: 'wiktionaryNative', sourceFamily: 'wiktionary' }],
}

describe('beta bilingual results', () => {
  test('one locale switch selects every prose leaf without changing shared facts', () => {
    const local = localizeResult(RESULT, 'local')
    const english = localizeResult(RESULT, 'en')
    expect(local.definition).toBe('abitazione')
    expect(local.roots[0].meaning).toBe('capanna')
    expect(local.ancestryGraph.branches[0].stages[0].form).toBe('casa')
    expect(english.definition).toBe('house')
  })

  test('rejects a missing local half at any required paired leaf', () => {
    const incomplete = structuredClone(RESULT) as unknown as Record<string, unknown>
    incomplete.definition = { en: 'house' }
    expect(BetaEtymologyResultSchema.safeParse(incomplete).success).toBe(false)
  })

  test('neutral Portuguese and regional-label rules are explicit', () => {
    const prompt = buildBetaSystemPrompt('Portuguese', 'pt')
    expect(prompt).toContain('neutral Portuguese')
    expect(prompt).toContain('Brazilian/European distinction')
  })

  test('a beta miss is not admitted by an English or non-Wiktionary fallback', () => {
    expect(
      hasCredibleMainSource({
        language: 'it',
        mainWord: {
          word: 'sale',
          etymonline: { text: 'English sale', url: 'https://example.test' },
          wiktionary: null,
          multilingualDictionary: { text: 'Italian senses', url: 'https://example.test/it' },
        },
        identifiedRoots: [],
        rootResearch: [],
        relatedResearch: [],
        totalSourcesFetched: 2,
      })
    ).toBe(false)
  })
})
