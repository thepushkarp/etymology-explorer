import { BETA_ETYMOLOGY_LLM_SCHEMA, ETYMOLOGY_LLM_SCHEMA } from './schemas/llm-schema'
import { describe, expect, test } from 'bun:test'
import { getLlmUsageFromError, isRecoverableBetaValidationError } from '@/lib/llm'

describe('getLlmUsageFromError', () => {
  test('extracts usage attached to a failed-synthesis error', () => {
    const error = Object.assign(new Error('Failed to parse LLM response'), {
      usage: { inputTokens: 3800, outputTokens: 1200, costUSD: 0.0082 },
    })

    expect(getLlmUsageFromError(error)).toEqual({
      inputTokens: 3800,
      outputTokens: 1200,
      costUSD: 0.0082,
    })
  })

  test('returns undefined for transport errors without usage', () => {
    expect(getLlmUsageFromError(new Error('OpenRouter request timeout after 90000ms'))).toBe(
      undefined
    )
  })

  test('returns undefined for non-error values and malformed usage shapes', () => {
    expect(getLlmUsageFromError(null)).toBe(undefined)
    expect(getLlmUsageFromError('boom')).toBe(undefined)
    expect(getLlmUsageFromError(Object.assign(new Error('x'), { usage: 'not-usage' }))).toBe(
      undefined
    )
    expect(
      getLlmUsageFromError(Object.assign(new Error('x'), { usage: { inputTokens: 'many' } }))
    ).toBe(undefined)
  })
})

describe('isRecoverableBetaValidationError', () => {
  test('admits selected-language post-processing validation failures', () => {
    expect(
      isRecoverableBetaValidationError(
        new Error('Schema validation failed: model changed the source-defined history set'),
        'es'
      )
    ).toBe(true)
  })

  test('does not retry English or non-validation failures', () => {
    const validationError = new Error('Schema validation failed: primary history is missing')

    expect(isRecoverableBetaValidationError(validationError, 'en')).toBe(false)
    expect(isRecoverableBetaValidationError(new Error('OpenRouter request failed'), 'it')).toBe(
      false
    )
  })
})

import { finalizeResult } from './llm'
import type { BetaEtymologyResult, ResearchContext } from './types'

function scopedFixture() {
  const history = {
    id: 'h1',
    label: { en: 'phrase', local: 'locution' },
    entryKind: 'lemma' as const,
    queryNodeId: 'q1',
    lemmaNodeId: 'q1',
    evidenceScopeIds: ['scope1'],
    pronunciation: '/x/',
    definition: { en: 'primary', local: 'primaire' },
    ancestryGraph: { branches: [] },
    roots: [],
    lore: { en: 'uncertain', local: 'incertain' },
    partsOfSpeech: [],
  }
  const result = {
    language: 'fr',
    word: 'café au lait',
    primaryHistoryId: 'h1',
    histories: [history],
    pronunciation: '/other/',
    definition: { en: 'duplicated prose differs', local: 'différent' },
    ancestryGraph: { branches: [] },
    roots: [],
    lore: { en: 'other', local: 'autre' },
    partsOfSpeech: [],
    suggestions: {},
    modernUsage: { hasSlangMeaning: false },
    sources: [{ name: 'invented' }],
  } as unknown as BetaEtymologyResult
  const context = {
    language: 'fr',
    mainWord: {
      word: 'café au lait',
      etymonline: null,
      wiktionary: null,
      wikipedia: {
        text: 'phrase history unknown',
        url: 'https://fr.wikipedia.org/wiki/Café_au_lait',
      },
    },
    rootResearch: [
      {
        root: 'café',
        lexeme: { word: 'café', language: 'fr' },
        etymonlineData: null,
        wiktionaryData: null,
        relatedTerms: [],
        wiktionaryNative: { text: 'component', url: 'https://fr.wiktionary.org/wiki/café' },
      },
    ],
    relatedResearch: [],
    identifiedRoots: [],
    totalSourcesFetched: 2,
    lexicalGraph: { histories: [history] },
  } as unknown as ResearchContext
  return { result, context }
}

test('canonical primary prose is projected and citations come from research', () => {
  const { result, context } = scopedFixture()
  expect(ETYMOLOGY_LLM_SCHEMA.properties.sources.maxItems).toBe(0)
  expect(
    (BETA_ETYMOLOGY_LLM_SCHEMA.properties as { sources: { maxItems: number } }).sources.maxItems
  ).toBe(0)
  result.sources = []
  const finalized = finalizeResult(result, context, 'standard')
  expect(finalized.definition).toEqual({ en: 'primary', local: 'primaire' })
  expect(finalized.pronunciation).toBe('/x/')
  expect(finalized.sources.map((source) => source.name)).toEqual(['wikipedia', 'wiktionaryNative'])
})
test('a changed evidence scope fails before an identity can be published', () => {
  const { result, context } = scopedFixture()
  result.histories[0].evidenceScopeIds = ['someone-elses-scope']
  context.lexicalGraph!.histories[0] = {
    ...context.lexicalGraph!.histories[0],
    evidenceScopeIds: ['scope1'],
  }
  expect(() => finalizeResult(result, context, 'streaming')).toThrow('history identity changed')
})

test('an incomplete synthesis fails with provider usage instead of returning partial JSON', async () => {
  const { synthesizeFromResearch } = await import('./llm')
  const savedFetch = globalThis.fetch
  const savedKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = savedKey ?? 'test-key'
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        status: 'incomplete',
        output_text: '{"word":"test"}',
        incomplete_details: { reason: 'max_output_tokens' },
        usage: { input_tokens: 100, output_tokens: 50, cost: 0.002 },
      }),
      { status: 200 }
    )) as unknown as typeof fetch
  try {
    const context = {
      mainWord: { word: 'test', etymonline: null, wiktionary: null },
      identifiedRoots: [],
      rootResearch: [],
      relatedResearch: [],
      totalSourcesFetched: 0,
    }
    try {
      await synthesizeFromResearch(context)
      throw new Error('Expected incomplete rejection')
    } catch (error) {
      expect((error as Error).message).toContain('max_output_tokens')
      expect(getLlmUsageFromError(error)).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        costUSD: 0.002,
      })
    }
  } finally {
    globalThis.fetch = savedFetch
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = savedKey
  }
})
