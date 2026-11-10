import { expect, test } from 'bun:test'
import { finalizeResult, isTransientSynthesisError, synthesizeFromResearch } from './llm'
import { parseDictionaryText } from './etymologyParser'
import { buildLexicalResearchGraph } from './lexemeGraph'
import { etymologyResult } from './testSupport/etymologyResult'
import type { ResearchContext, ResearchEntryContext } from './types'

function fixture(text = 'Borrowed from English chat.') {
  const entry: ResearchEntryContext = {
    id: 'history:pt:chat',
    source: 'wiktionaryEnglish',
    heading: 'Etymology',
    text,
    etymologyText: text,
    sectionHeadings: [],
    evidenceScopeId: 'scope:pt:chat',
    sourceUrl: 'https://en.wiktionary.org/wiki/chat#Portuguese',
    entryKind: 'lemma',
  }
  const chain = parseDictionaryText(text, 'chat', entry.source, {
    historyId: entry.id,
    evidenceScopeId: entry.evidenceScopeId,
    provider: entry.source,
  })
  const context: ResearchContext = {
    language: 'pt',
    mainWord: {
      word: 'chat',
      etymonline: null,
      wiktionary: null,
      sources: [
        {
          provider: entry.source,
          sourceFamily: 'wiktionary',
          data: { text, url: entry.sourceUrl },
        },
      ],
    },
    rootResearch: [],
    relatedResearch: [],
    identifiedRoots: [],
    totalSourcesFetched: 0,
    entryContexts: [entry],
    parsedChains: chain.links.length ? [chain] : [],
    lexicalGraph: buildLexicalResearchGraph('chat', 'pt', [entry], [chain]),
  }
  const result = etymologyResult(
    { word: 'chat', definition: 'An online conversation.', lore: 'Borrowed from English chat.' },
    context
  )
  const corrected = structuredClone(result)
  corrected.histories[0].ancestryGraph = {
    branches: [
      { root: 'chat', stages: [{ stage: 'English', form: 'chat', note: 'The attested donor.' }] },
    ],
  }
  return { context, result, corrected }
}

test('same-spelling donors in another language require lineage before streaming', () => {
  const { context, result, corrected } = fixture()
  expect(() => finalizeResult(result, context, 'streaming')).toThrow(
    'source-attested ancestry is missing'
  )
  expect(finalizeResult(corrected, context, 'standard').ancestryGraph.branches).toHaveLength(1)
})

test('empty lineage remains valid without an affirmative whole-word ancestry account', () => {
  for (const text of [
    'Origin unknown.',
    'Not from English chat.',
    'Possibly borrowed from English chat.',
    'Compare the component from English chat.',
  ]) {
    const { context, result } = fixture(text)
    expect(finalizeResult(result, context, 'streaming').ancestryGraph.branches).toEqual([])
  }
  for (const kind of ['component', 'foreign-history', 'context', 'morphology'] as const) {
    const { context, result } = fixture()
    if (kind === 'component') {
      context.parsedChains![0].subject = { word: 'piece', language: 'pt' }
      context.lexicalGraph = buildLexicalResearchGraph(
        'chat',
        'pt',
        context.entryContexts!,
        context.parsedChains!
      )
    } else if (kind === 'foreign-history') {
      context.parsedChains![0].historyId = 'another-history'
      context.lexicalGraph = buildLexicalResearchGraph(
        'chat',
        'pt',
        context.entryContexts!,
        context.parsedChains!
      )
    } else if (kind === 'context') context.mainWord.sources![0].evidenceRole = 'lexical'
    else Object.values(context.lexicalGraph!.edges)[0].role = 'morphology'
    expect(finalizeResult(result, context, 'standard').ancestryGraph.branches).toEqual([])
  }
})

test('source-attested Japanese coinage never requires a forbidden whole-word English donor', () => {
  const { context } = fixture('Wasei-eigo. Borrowed from English chat.')
  context.language = 'ja'
  context.lexicalGraph = buildLexicalResearchGraph(
    'chat',
    'ja',
    context.entryContexts!,
    context.parsedChains!
  )
  const result = etymologyResult({ word: 'chat' }, context)
  expect(finalizeResult(result, context, 'standard').ancestryGraph.branches).toEqual([])
  const english = etymologyResult(
    {
      word: 'chat',
      ancestryGraph: {
        branches: [{ root: 'chat', stages: [{ stage: 'English', form: 'chat', note: '' }] }],
      },
    },
    context
  )
  expect(() => finalizeResult(english, context, 'standard')).toThrow(
    'Japanese coinage cannot have a whole-word English ancestor'
  )
})

test('missing lineage gets one error-guided unary recovery and retains both usages', async () => {
  const { context, result, corrected } = fixture()
  const savedFetch = globalThis.fetch
  const savedKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = savedKey ?? 'test-key'
  const requests: { input: string; stream?: boolean }[] = []
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body))
    requests.push(request)
    const text = JSON.stringify(requests.length === 1 ? result : corrected)
    const response = {
      status: 'completed',
      output_text: text,
      usage: { input_tokens: 10, output_tokens: 20, cost: 0.001 },
    }
    return request.stream
      ? new Response(
          `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\n` +
            `data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`
        )
      : Response.json(response)
  }) as unknown as typeof fetch
  const sections: string[] = []
  try {
    const synthesis = await synthesizeFromResearch(context, {
      onSection: (section) => sections.push(section),
    })
    expect(requests).toHaveLength(2)
    expect(requests[0].stream).toBe(true)
    expect(requests[1].stream).toBeUndefined()
    expect(requests[1].input).toContain('source-attested ancestry is missing')
    expect(requests[1].input).toContain('English')
    expect(requests[1].input).toContain('history:pt:chat')
    expect(synthesis.result.ancestryGraph.branches).toHaveLength(1)
    expect(synthesis.usage).toEqual({ inputTokens: 20, outputTokens: 40, costUSD: 0.002 })
    expect(sections).not.toContain('ancestryGraph')
  } finally {
    globalThis.fetch = savedFetch
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = savedKey
  }
})

test('malformed output and validation share a total limit of two model calls', async () => {
  const { context, result } = fixture()
  const savedFetch = globalThis.fetch
  const savedKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = savedKey ?? 'test-key'
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return Response.json({
      status: 'completed',
      output_text: calls === 1 ? '{' : JSON.stringify(result),
      usage: { input_tokens: 10, output_tokens: 20, cost: 0.001 },
    })
  }) as unknown as typeof fetch
  try {
    await expect(synthesizeFromResearch(context)).rejects.toMatchObject({
      message: expect.stringContaining('source-attested ancestry is missing'),
      usage: { inputTokens: 20, outputTokens: 40, costUSD: 0.002 },
    })
    expect(calls).toBe(2)
  } finally {
    globalThis.fetch = savedFetch
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = savedKey
  }
})

test.each([
  [503, 'Provider unavailable', 2],
  [429, 'Provider rate limited', 1],
  [429, 'Insufficient quota', 1],
  [401, 'Invalid key', 1],
  [400, 'Invalid model', 1],
] as const)('synthesis HTTP %s %s makes at most %s calls', async (status, message, expected) => {
  const { context, corrected } = fixture()
  const savedFetch = globalThis.fetch
  const savedKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = savedKey ?? 'test-key'
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return calls === 1
      ? Response.json({ error: { message } }, { status })
      : Response.json({ status: 'completed', output_text: JSON.stringify(corrected) })
  }) as unknown as typeof fetch
  try {
    if (expected === 2) await synthesizeFromResearch(context)
    else await expect(synthesizeFromResearch(context)).rejects.toThrow(message)
    expect(calls).toBe(expected)
  } finally {
    globalThis.fetch = savedFetch
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = savedKey
  }
})

test('caller cancellation during a failed model attempt prevents retry', async () => {
  const { context } = fixture()
  const savedFetch = globalThis.fetch
  const savedKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = savedKey ?? 'test-key'
  const controller = new AbortController()
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    controller.abort()
    return Response.json({ error: { message: 'Provider unavailable' } }, { status: 503 })
  }) as unknown as typeof fetch
  try {
    await expect(synthesizeFromResearch(context, { signal: controller.signal })).rejects.toThrow()
    expect(calls).toBe(1)
  } finally {
    globalThis.fetch = savedFetch
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = savedKey
  }
})

test.each([200, 503])('unparseable HTTP %s responses get bounded recovery', async (status) => {
  const { context, corrected } = fixture()
  const savedFetch = globalThis.fetch
  const savedKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = savedKey ?? 'test-key'
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return calls === 1
      ? new Response('<html>Service unavailable</html>', { status })
      : Response.json({ status: 'completed', output_text: JSON.stringify(corrected) })
  }) as unknown as typeof fetch
  try {
    expect((await synthesizeFromResearch(context)).result.language).toBe('pt')
    expect(calls).toBe(2)
  } finally {
    globalThis.fetch = savedFetch
    if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = savedKey
  }
})

test('only recognized transport failures are transient', () => {
  expect(isTransientSynthesisError(new Error('Request timeout after 90000ms'))).toBe(true)
  expect(isTransientSynthesisError(new TypeError('fetch failed'))).toBe(true)
  expect(isTransientSynthesisError(new DOMException('Aborted', 'AbortError'))).toBe(false)
  expect(isTransientSynthesisError(new TypeError('Invalid request shape'))).toBe(false)
})
