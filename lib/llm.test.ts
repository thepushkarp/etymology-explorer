import { describe, expect, test } from 'bun:test'
import {
  finalizeResult,
  synthesizeFromResearch,
  getLlmUsageFromError,
  isRecoverableValidationError,
} from '@/lib/llm'
import { scopeEnglishHistories } from './research'
import { etymologyResult } from './testSupport/etymologyResult'
import type { EtymologyResult, ResearchContext } from './types'
import { toPartialResult, type PartialEtymology } from './streamReducer'

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

describe('isRecoverableValidationError', () => {
  test('admits post-processing validation failures', () => {
    expect(
      isRecoverableValidationError(
        new Error('Schema validation failed: model changed the source-defined history set')
      )
    ).toBe(true)
  })

  test('does not retry transport failures', () => {
    expect(isRecoverableValidationError(new Error('OpenRouter request failed'))).toBe(false)
  })
})

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
      scopeEnglishHistories(context)
      const result = etymologyResult(
        {
          word: 'rizz',
          pronunciation: '/rɪz/',
          definition: 'Charisma.',
          lore: 'Origin uncertain.',
          modernUsage: {
            hasSlangMeaning: true,
            slangDefinition: definition,
            contexts: ['Internet culture'],
          },
        },
        context
      )
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
    label: 'phrase',
    entryKind: 'lemma' as const,
    queryNodeId: 'q1',
    lemmaNodeId: 'q1',
    evidenceScopeIds: ['scope1'],
    pronunciation: '/x/',
    definition: 'primary',
    ancestryGraph: { branches: [] },
    roots: [],
    lore: 'uncertain',
    partsOfSpeech: [],
  }
  const result = {
    language: 'fr',
    word: 'café au lait',
    primaryHistoryId: 'h1',
    histories: [history],
    pronunciation: '/other/',
    definition: 'duplicated prose differs',
    ancestryGraph: { branches: [] },
    roots: [],
    lore: 'other',
    partsOfSpeech: [],
    suggestions: {},
    modernUsage: { hasSlangMeaning: false },
    sources: [{ name: 'invented' }],
  } as unknown as EtymologyResult
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
    entryContexts: [
      {
        id: 'h1',
        source: 'wikipedia',
        heading: 'café au lait',
        text: 'phrase history unknown',
        sectionHeadings: [],
        evidenceScopeId: 'scope1',
        sourceUrl: 'https://fr.wikipedia.org/wiki/Café_au_lait',
        entryKind: 'lemma',
      },
    ],
  } as unknown as ResearchContext
  return { result, context }
}

test('canonical primary prose is projected and citations come from research', () => {
  const { result, context } = scopedFixture()
  const examples = [
    { text: 'Un café au lait, s’il vous plaît.', translation: 'A café au lait, please.' },
    { text: 'Le café au lait refroidit.', translation: 'The café au lait is getting cold.' },
  ]
  result.histories[0].examples = examples
  const finalized = finalizeResult(result, context, 'standard')
  expect(finalized.definition).toBe('primary')
  expect(finalized.examples).toEqual(examples)
  expect(finalized.pronunciation).toBe('/x/')
  expect(finalized.sources.map((source) => source.name)).toEqual(['wikipedia', 'wiktionaryNative'])
})

test('history and entry readings are copied from their exact source contexts', () => {
  const { result, context } = scopedFixture()
  result.transliteration = 'invented entry reading'
  result.histories[0].transliteration = 'invented history reading'
  expect(finalizeResult(result, context, 'standard').transliteration).toBeUndefined()
  expect(result.histories[0].transliteration).toBeUndefined()
  context.entryContexts![0].transliteration = 'source reading'
  const finalized = finalizeResult(result, context, 'standard')
  expect(finalized.transliteration).toBe('source reading')
  expect(finalized.histories[0].transliteration).toBe('source reading')
})
test('counterparts come only from the matching source context', () => {
  const { result, context } = scopedFixture()
  result.counterparts = [{ word: 'invented', language: 'en' }]
  result.histories[0].counterparts = result.counterparts
  expect(finalizeResult(result, context, 'standard').counterparts).toBeUndefined()
  expect(result.histories[0].counterparts).toBeUndefined()
  context.entryContexts![0].counterparts = [{ word: 'کتاب', language: 'ur' }]
  const finalized = finalizeResult(result, context, 'standard')
  expect(finalized.counterparts).toEqual([{ word: 'کتاب', language: 'ur' }])
  expect(finalized.histories[0].counterparts).toEqual(finalized.counterparts)
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

test('an encyclopedia-only history cannot establish a lexical ancestry', () => {
  const { result, context } = scopedFixture()
  result.histories[0].ancestryGraph = {
    branches: [
      {
        root: 'unattested',
        stages: [{ stage: 'Latin', form: 'unattested', note: 'Unsupported.' }],
      },
    ],
  }
  expect(() => finalizeResult(result, context, 'streaming')).toThrow(
    'contextual or senses-only source cannot establish ancestry'
  )
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
        transliteration: 'source reading',
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
    const output = {
      ...result,
      language,
      definition: 'wrong top-level definition',
      lore: 'wrong top-level story',
    }
    // Unsupported reconstructed ancestry must already be pruned in the
    // progressive projection, just as it is in the terminal result.
    output.histories[0].ancestryGraph = {
      branches: [
        {
          root: '*invented',
          stages: [{ stage: 'Proto-Germanic', form: '*invented', note: '' }],
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
      expect(visible.transliteration).toBe('source reading')
      expect(visible.definition).toBe('primary')
      expect(visible.ancestryGraph.branches).toEqual([])
      expect(emissions.filter(({ section }) => section === 'histories')).toHaveLength(0)
      expect(emissions.every((emission) => !emission.completed)).toBe(true)
      release()
      const finalized = await pending
      expect(finalized.result.histories).toHaveLength(2)
      expect(emissions.filter(({ section }) => section === 'histories')).toHaveLength(1)
      expect(finalized.usage).toEqual({ inputTokens: 10, outputTokens: 20, costUSD: 0.001 })
      for (const name of [
        'pronunciation',
        'transliteration',
        'definition',
        'ancestryGraph',
        'lore',
      ]) {
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

test.each(['scope', 'translation', 'sibling'] as const)(
  'an invalid %s value prevents a complete history collection and retains billed usage',
  async (fault) => {
    const fixture = scopedFixture()
    const context = structuredClone(fixture.context)
    const output = structuredClone(fixture.result)
    if (fault === 'scope') output.histories[0].evidenceScopeIds = ['someone-elses-scope']
    // A French example sentence without its English gloss.
    else if (fault === 'translation')
      output.histories[0].examples = [{ text: 'Un café.' }, { text: 'Deux cafés.' }]
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
