import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { synthesizeFromResearch, getLlmUsageFromError } from './llm'
import { parseWiktionaryText } from './etymologyParser'
import type { EtymologyResult, ResearchContext } from './types'

const originalFetch = globalThis.fetch
const previousKey = process.env.OPENROUTER_API_KEY
beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'test-orthography'
})
afterEach(() => {
  globalThis.fetch = originalFetch
  if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY
  else process.env.OPENROUTER_API_KEY = previousKey
})

function context(word = 'côte'): ResearchContext {
  return {
    mainWord: {
      word,
      etymonline: null,
      wiktionary: { text: 'from French côte', url: 'https://en.wiktionary.org/wiki/côte' },
    },
    identifiedRoots: [],
    rootResearch: [],
    relatedResearch: [],
    totalSourcesFetched: 1,
    parsedChains: [parseWiktionaryText('from French côte', word)],
  }
}
function output(word: string): EtymologyResult {
  return {
    word,
    pronunciation: '/kot/',
    definition: 'A fixture.',
    ancestryGraph: {
      branches: [
        {
          root: word,
          stages: [
            {
              stage: 'French',
              form: 'cote',
              note: '',
              confidence: 'high',
              evidence: [{ source: 'wiktionary', snippet: 'invented' }],
            },
          ],
        },
      ],
    },
    roots: [],
    lore: 'A fixture history.',
    sources: [],
  }
}

function provider(result: EtymologyResult, completed?: () => void) {
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body))
    const outputText = JSON.stringify(result)
    const response = {
      output_text: outputText,
      usage: { input_tokens: 10, output_tokens: 20, cost: 0.001 },
    }
    if (!request.stream) return Response.json(response)
    const encoder = new TextEncoder()
    return new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: outputText })}\n\n`
            )
          )
          await new Promise((resolve) => setTimeout(resolve, 5))
          completed?.()
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'response.completed', response })}\n\n`)
          )
          controller.close()
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } }
    )
  }) as typeof fetch
}

describe('synthesis spelling and publication', () => {
  test.each([false, true])(
    'rejects changed query spelling (stream=%s) and retains billed usage',
    async (stream) => {
      provider(output('cote'))
      const sections: string[] = []
      let failure: unknown
      try {
        await synthesizeFromResearch(
          context(),
          stream ? { onSection: (name) => sections.push(name) } : undefined
        )
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(Error)
      expect((failure as Error).message).toContain('spelling')
      expect(getLlmUsageFromError(failure)).toMatchObject({ inputTokens: 10, outputTokens: 20 })
      expect(sections).toEqual([])
    }
  )

  test('publishes only enriched graph sections, after the provider completes', async () => {
    let completed = false
    provider(output('co\u0302te'), () => {
      completed = true
    })
    const emitted: Array<[string, unknown]> = []
    const result = await synthesizeFromResearch(context(), {
      onSection: (name, data) => {
        if (name === 'ancestryGraph') expect(completed).toBe(true)
        emitted.push([name, data])
      },
    })
    const graphs = emitted.filter(([name]) => name === 'ancestryGraph')
    expect(graphs).toHaveLength(1)
    expect(graphs[0][1]).toEqual(result.result.ancestryGraph)
    expect(result.result.ancestryGraph.branches[0].stages[0]).toMatchObject({
      confidence: 'low',
      evidence: [],
    })
    expect(emitted.map(([name]) => name)).toEqual([
      'word',
      'pronunciation',
      'definition',
      'ancestryGraph',
      'roots',
      'lore',
      'sources',
    ])
  })

  test('does not publish held sections when final validation fails', async () => {
    const invalid = output('côte')
    invalid.pronunciation = 123 as unknown as string
    provider(invalid)
    const sections: string[] = []
    await expect(
      synthesizeFromResearch(context(), { onSection: (name) => sections.push(name) })
    ).rejects.toThrow('Schema validation failed')
    expect(sections).not.toContain('ancestryGraph')
    expect(sections).not.toContain('sources')
  })
})
