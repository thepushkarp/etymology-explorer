import { describe, expect, test } from 'bun:test'
import {
  finalizeResult,
  synthesizeFromResearch,
  getLlmUsageFromError,
  isRecoverableBetaValidationError,
} from '@/lib/llm'

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

import type { BetaEtymologyResult, EtymologyResult, ResearchContext } from './types'
import { toPartialResult, type PartialEtymology } from './streamReducer'

describe('modern usage evidence', () => {
  const wikipediaText =
    'Rizz is an English slang term referring to charisma, especially the ability to attract a romantic partner. It became popular in online communities and is used in discussions of dating.'
  const incelsText =
    'This community slang term refers to charisma in dating conversations. It is used in online discussions about attraction and relationships, with examples describing how someone starts a conversation.'

  test.each([
    ['Wikipedia', wikipediaText, undefined, 'Charisma used to attract a romantic partner.', true],
    ['Incel Wiki', undefined, incelsText, 'Charisma used to attract a romantic partner.', true],
    [
      'unrelated Wikipedia prose',
      'The term names a network protocol used to send data over the internet. It defines packet formats and connection states for computers communicating across different physical networks.',
      undefined,
      'Charisma used to attract a romantic partner.',
      false,
    ],
    [
      'a thin Wikipedia mention',
      'Rizz is slang.',
      undefined,
      'A form of charisma in dating.',
      false,
    ],
    ['a vague generated definition', wikipediaText, undefined, 'Internet slang', false],
  ] as const)(
    'validates modern usage supported by %s',
    (_label, wikipedia, incelsWiki, definition, accepted) => {
      const context: ResearchContext = {
        language: 'en',
        mainWord: {
          word: 'rizz',
          etymonline: null,
          wiktionary: null,
          ...(wikipedia
            ? { wikipedia: { text: wikipedia, url: 'https://en.wikipedia.org/wiki/Rizz' } }
            : {}),
          ...(incelsWiki
            ? { incelsWiki: { text: incelsWiki, url: 'https://incels.wiki/w/rizz' } }
            : {}),
        },
        identifiedRoots: [],
        rootResearch: [],
        relatedResearch: [],
        totalSourcesFetched: 1,
      }
      const result: EtymologyResult = {
        language: 'en',
        word: 'rizz',
        pronunciation: '/rɪz/',
        definition: 'Charisma.',
        roots: [],
        ancestryGraph: { branches: [] },
        lore: 'Origin uncertain.',
        sources: [],
        modernUsage: {
          hasSlangMeaning: true,
          slangDefinition: definition,
          contexts: ['Internet culture'],
        },
      }
      const finalized = finalizeResult(result, context, 'standard')
      expect(finalized.modernUsage).toEqual(
        accepted
          ? { hasSlangMeaning: true, slangDefinition: definition, contexts: ['Internet culture'] }
          : { hasSlangMeaning: false }
      )
    }
  )
})

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
  const finalized = finalizeResult(result, context, 'standard')
  expect(finalized.definition).toEqual({ en: 'primary', local: 'primaire' })
  expect(finalized.pronunciation).toBe('/x/')
  expect(finalized.sources.map((source) => source.name)).toEqual(['wikipedia', 'wiktionaryNative'])
})
test('a senses-only fallback cannot publish an ancestry graph', () => {
  const { result, context } = scopedFixture()
  result.histories[0].entryKind = 'unresolved'
  context.lexicalGraph!.histories[0].entryKind = 'unresolved'
  context.entryContexts = [
    {
      id: 'h1',
      source: 'multilingualDictionary',
      heading: 'fixture',
      text: 'A definition.',
      sectionHeadings: [],
      evidenceScopeId: 'scope1',
      sourceUrl: 'https://freedictionaryapi.com',
      entryKind: 'unresolved',
    },
  ]
  context.mainWord.wikipedia = null
  context.mainWord.multilingualDictionary = {
    text: 'A definition.',
    url: 'https://freedictionaryapi.com',
  }
  result.histories[0].ancestryGraph = { branches: [{ root: 'invented', stages: [] }] }
  expect(() => finalizeResult(result, context, 'streaming')).toThrow(
    'dictionary fallback cannot establish ancestry'
  )
  result.histories[0].ancestryGraph = { branches: [] }
  const finalized = finalizeResult(result, context, 'streaming')
  expect(finalized.ancestryGraph.branches).toEqual([])
  expect(
    finalized.sources.find((source) => source.name === 'multilingualDictionary')?.sourceFamily
  ).toBe('wiktionary')
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
    await expect(synthesizeFromResearch(context)).rejects.toMatchObject({
      message: expect.stringContaining('max_output_tokens'),
      usage: { inputTokens: 100, outputTokens: 50, costUSD: 0.002 },
    })
  } finally {
    globalThis.fetch = savedFetch
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = savedKey
  }
})

test.each([
  ['English', 'en', false],
  ['French', 'fr', false],
  ['reordered French', 'fr', true],
] as const)(
  'streams the validated %s primary history before its array closes',
  async (_label, language, reordered) => {
    const { result, context } = scopedFixture()
    const sibling = {
      ...structuredClone(result.histories[0]),
      id: 'h2',
      queryNodeId: 'q2',
      lemmaNodeId: 'q2',
      evidenceScopeIds: ['scope2'],
    }
    result.histories.push(sibling)
    context.lexicalGraph!.histories.push({ ...sibling, nodeIds: ['q2'], edgeIds: [] })
    context.language = language
    context.entryContexts = [
      {
        id: 'h1',
        evidenceScopeId: 'scope1',
        source: 'wiktionary',
        heading: 'Etymology',
        text: 'Origin uncertain.',
        sectionHeadings: [],
        sourceUrl: 'https://en.wiktionary.org/wiki/café_au_lait',
        entryKind: 'lemma',
      },
      {
        id: 'h2',
        evidenceScopeId: 'scope2',
        source: 'wiktionary',
        heading: 'Etymology 2',
        text: 'An independent origin.',
        sectionHeadings: [],
        sourceUrl: 'https://en.wiktionary.org/wiki/café_au_lait',
        entryKind: 'lemma',
      },
    ]
    const output =
      language === 'en'
        ? {
            ...result,
            language,
            definition: 'wrong top-level definition',
            lore: 'wrong top-level story',
            histories: result.histories.map((history) => ({
              ...history,
              label: history.label.en,
              definition: history.definition.en,
              lore: history.lore.en,
            })),
          }
        : result
    // Unsupported reconstructed ancestry must already be pruned in the
    // progressive projection, just as it is in the terminal result.
    output.histories[0].ancestryGraph = {
      branches: [
        {
          root: '*invented',
          stages: [{ stage: 'Proto-Germanic', form: '*invented', note: { en: '', local: '' } }],
        },
      ],
    }
    if (reordered) output.histories.reverse()
    const text = JSON.stringify(output)
    const prefix =
      JSON.stringify({
        language: output.language,
        word: output.word,
        primaryHistoryId: output.primaryHistoryId,
      }).slice(0, -1) +
      ',"histories":[' +
      (reordered
        ? output.histories.map((history) => JSON.stringify(history)).join(',')
        : JSON.stringify(output.histories[0]))
    expect(text.startsWith(prefix)).toBe(true)
    const split = prefix.length
    const savedFetch = globalThis.fetch
    const savedKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = savedKey ?? 'test-key'
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let completed = false
    const encoder = new TextEncoder()
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream({
          async start(controller) {
            const send = (event: unknown) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            send({ type: 'response.output_text.delta', delta: text.slice(0, split) })
            await gate
            send({ type: 'response.output_text.delta', delta: text.slice(split) })
            completed = true
            send({
              type: 'response.completed',
              response: {
                status: 'completed',
                usage: { input_tokens: 10, output_tokens: 20, cost: 0.001 },
              },
            })
            controller.close()
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } }
      )) as unknown as typeof fetch
    const emissions: Array<{ section: string; data: unknown; completed: boolean }> = []
    const pending = synthesizeFromResearch(context, {
      onSection: (section, data) => emissions.push({ section, data, completed }),
    })
    try {
      // A bounded wait also makes the test fail if a regression holds all
      // callbacks until completion, instead of deadlocking on a callback.
      await new Promise((resolve) => setTimeout(resolve, 20))
      const sections = Object.fromEntries(
        emissions.map(({ section, data }) => [section, data])
      ) as PartialEtymology
      const visible = toPartialResult(result.word, sections, language)
      expect(visible.pronunciation).toBe('/x/')
      expect(visible.definition).toBe(language === 'en' ? 'primary' : 'primaire')
      expect(visible.ancestryGraph.branches).toEqual([])
      expect(emissions.filter(({ section }) => section === 'histories')).toHaveLength(0)
      expect(emissions.every((emission) => !emission.completed)).toBe(true)
      release()
      const finalized = await pending
      expect(finalized.result.histories).toHaveLength(2)
      expect(emissions.filter(({ section }) => section === 'histories')).toHaveLength(1)
      expect(finalized.usage).toEqual({ inputTokens: 10, outputTokens: 20, costUSD: 0.001 })
      for (const name of ['pronunciation', 'definition', 'ancestryGraph', 'lore']) {
        const emitted = emissions.filter(({ section }) => section === name)
        expect(emitted).toHaveLength(1)
        expect(emitted[0].data).toEqual(
          (finalized.result as unknown as Record<string, unknown>)[name]
        )
      }
    } finally {
      release()
      await pending.catch(() => {})
      globalThis.fetch = savedFetch
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = savedKey
    }
  }
)

test.each(['scope', 'bilingual', 'sibling'] as const)(
  'an invalid %s value prevents a complete history collection and retains billed usage',
  async (fault) => {
    const fixture = scopedFixture()
    const context = structuredClone(fixture.context)
    const output = structuredClone(fixture.result)
    if (fault === 'scope') output.histories[0].evidenceScopeIds = ['someone-elses-scope']
    else if (fault === 'bilingual') output.histories[0].lore.local = ''
    else {
      const sibling = {
        ...structuredClone(output.histories[0]),
        id: 'h2',
        queryNodeId: 'q2',
        lemmaNodeId: 'q2',
        evidenceScopeIds: ['scope2'],
      }
      context.lexicalGraph!.histories.push({ ...sibling, nodeIds: ['q2'], edgeIds: [] })
      sibling.evidenceScopeIds = ['someone-elses-scope']
      output.histories.push(sibling)
    }
    const text = JSON.stringify(output)
    const response = {
      status: 'completed',
      output_text: text,
      usage: { input_tokens: 10, output_tokens: 20, cost: 0.001 },
    }
    const savedFetch = globalThis.fetch
    const savedKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = savedKey ?? 'test-key'
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      if (!JSON.parse(String(init?.body)).stream) return Response.json(response)
      return new Response(
        `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\n` +
          `data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } }
      )
    }) as typeof fetch
    const sections: string[] = []
    try {
      await expect(
        synthesizeFromResearch(context, {
          onSection: (section) => sections.push(section),
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('Schema validation failed'),
        usage: { inputTokens: 20, outputTokens: 40, costUSD: 0.002 },
      })
      for (const section of ['definition', 'ancestryGraph', 'lore'])
        expect(sections.includes(section)).toBe(fault === 'sibling')
      expect(sections).not.toContain('histories')
    } finally {
      globalThis.fetch = savedFetch
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = savedKey
    }
  }
)
