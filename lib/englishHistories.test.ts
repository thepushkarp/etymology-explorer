import { describe, expect, test } from 'bun:test'
import { scopeEnglishHistories } from './research'
import { finalizeResult, synthesizeFromResearch } from './llm'
import { localizeHistoryChoices, localizeResult } from './resultLocalization'
import { EtymologyResultSchema } from './schemas/etymology'
import type { EnglishEtymologyResult, LexicalHistory, ResearchContext, SourceData } from './types'

/** Synthetic source-section fixture: boundaries and shared senses, not factual source attribution. */
function source(word: string, sections: string[]): SourceData {
  return {
    text: sections.join('\n'),
    url: `https://en.wiktionary.org/wiki/${word}`,
    entryGroups: sections.map((text, index) => ({
      index: String(index + 1),
      number: String(index + 1),
      level: 3,
      heading: `Etymology ${index + 1}`,
      anchor: `Etymology_${index + 1}`,
      text,
      sections: [],
    })),
  }
}

function context(word: string, sections: string[]): ResearchContext {
  const research: ResearchContext = {
    language: 'en',
    mainWord: { word, etymonline: null, wiktionary: source(word, sections) },
    identifiedRoots: [],
    rootResearch: [],
    relatedResearch: [],
    totalSourcesFetched: 0,
  }
  scopeEnglishHistories(research)
  return research
}

function result(research: ResearchContext): EnglishEtymologyResult {
  const histories: LexicalHistory<string>[] = research.lexicalGraph!.histories.map(
    (candidate, index) => ({
      id: candidate.id,
      entryKind: candidate.entryKind,
      queryNodeId: candidate.queryNodeId,
      lemmaNodeId: candidate.lemmaNodeId,
      formOf: candidate.formOf,
      evidenceScopeIds: candidate.evidenceScopeIds,
      label: `sense ${index + 1}`,
      pronunciation: '/dɪk/',
      definition: `definition ${index + 1}`,
      roots: [],
      ancestryGraph: { branches: [] },
      lore: `history ${index + 1}`,
    })
  )
  return {
    word: research.mainWord.word,
    language: 'en',
    primaryHistoryId: histories[0].id,
    histories,
    pronunciation: '/wrong/',
    definition: 'wrong projection',
    roots: [],
    ancestryGraph: { branches: [] },
    lore: 'wrong projection',
    sources: [],
  }
}

function dickContext() {
  return context('dick', [
    'Etymology 1. From Richard, from Old High German Rihhart. Name-derived ordinary, vulgar and verb senses.',
    'Etymology 2. Clipping of detective. Noun: detective.',
    'Etymology 3. Clipping of declaration. Noun: declaration.',
    'Etymology 4. Counting word. Origin unknown.',
  ])
}

describe('English source-defined histories', () => {
  test('four source sections stay independent while related name senses share one history', () => {
    const research = dickContext()
    expect(new Set(research.entryContexts!.map((entry) => entry.evidenceScopeId)).size).toBe(4)
    const finalized = finalizeResult(
      result(research),
      research,
      'standard'
    ) as EnglishEtymologyResult
    expect(finalized.histories).toHaveLength(4)
    expect(finalized.definition).toBe('definition 1')
    expect(typeof finalized.lore).toBe('string')
  })

  test('foreign history stages cannot leak into another history or borrow its evidence', () => {
    const research = dickContext()
    const generated = result(research)
    generated.histories![1].ancestryGraph.branches = [
      {
        root: 'detective',
        stages: [{ stage: 'Old High German', form: 'Rihhart', note: 'wrong history' }],
      },
    ]
    expect(() => finalizeResult(generated, research, 'streaming')).toThrow('another history')
  })

  test('an early primary history retains foreign evidence checks before publishing prose', async () => {
    const research = context('fixture', ['From Latin malus.', 'From Latin bonus.'])
    const generated = result(research)
    generated.histories![0].ancestryGraph.branches = [
      { root: 'bonus', stages: [{ stage: 'Latin', form: 'bonus', note: 'another history' }] },
    ]
    const text = JSON.stringify(generated)
    const savedFetch = globalThis.fetch
    const savedKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = savedKey ?? 'test-key'
    globalThis.fetch = (async () =>
      new Response(
        `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\n` +
          `data: ${JSON.stringify({
            type: 'response.completed',
            response: {
              status: 'completed',
              usage: { input_tokens: 10, output_tokens: 20, cost: 0.001 },
            },
          })}\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } }
      )) as unknown as typeof fetch
    const sections: string[] = []
    try {
      await expect(
        synthesizeFromResearch(research, {
          onSection: (section) => sections.push(section),
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('another history'),
        usage: { inputTokens: 10, outputTokens: 20, costUSD: 0.001 },
      })
      expect(sections).not.toContain('definition')
      expect(sections).not.toContain('ancestryGraph')
    } finally {
      globalThis.fetch = savedFetch
      if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = savedKey
    }
  })

  test('a merge cannot use an ancestor from another lexical history', () => {
    const research = dickContext()
    const generated = result(research)
    generated.histories![1].ancestryGraph = {
      branches: [
        { root: 'detective', stages: [{ stage: 'English', form: 'detective', note: 'clipping' }] },
        {
          root: 'detect',
          stages: [{ stage: 'English', form: 'detect', note: 'wrong composition' }],
        },
      ],
      mergePoint: { form: 'Rihhart', note: 'foreign history' },
    }
    expect(() => finalizeResult(generated, research, 'standard')).toThrow('another history')
  })

  test('rejects changed scope IDs and missing source histories', () => {
    const research = dickContext()
    const generated = result(research)
    generated.histories![0].evidenceScopeIds = ['foreign-scope']
    expect(() => finalizeResult(generated, research, 'standard')).toThrow('identity changed')
    const missing = result(research)
    delete missing.histories
    expect(() => finalizeResult(missing, research, 'standard')).toThrow('histories are missing')
  })

  test('rejects duplicate ancestry paths that emerge only after reconstructed roots are pruned', () => {
    const research = dickContext()
    const generated = result(research)
    generated.histories![0].ancestryGraph.branches = [
      {
        root: 'rik-',
        stages: [
          { stage: 'Proto-Germanic', form: '*rik-', note: 'unsupported root' },
          { stage: 'Old High German', form: 'Rihhart', note: 'name' },
        ],
      },
      {
        root: '-hardu',
        stages: [
          { stage: 'Proto-Germanic', form: '*hardu', note: 'unsupported root' },
          { stage: 'Old High German', form: 'Rihhart', note: 'same name' },
        ],
      },
    ]
    expect(() => finalizeResult(generated, research, 'standard')).toThrow(
      'duplicated ancestry branch'
    )
    expect(
      generated.histories![0].ancestryGraph.branches.map((branch) =>
        branch.stages.map((stage) => stage.form)
      )
    ).toEqual([['Rihhart'], ['Rihhart']])
  })

  test('a genuine compound keeps both roots in one history with the whole form after merging', () => {
    const research = context('blackbird', ['From black + bird. A bird with black plumage.'])
    const generated = result(research)
    generated.histories![0].ancestryGraph = {
      branches: [
        { root: 'black', stages: [{ stage: 'English', form: 'black', note: 'colour' }] },
        { root: 'bird', stages: [{ stage: 'English', form: 'bird', note: 'animal' }] },
      ],
      mergePoint: { form: 'blackbird', note: 'compound' },
      postMerge: [{ stage: 'English', form: 'blackbird', note: 'bird' }],
    }
    const finalized = finalizeResult(generated, research, 'standard') as EnglishEtymologyResult
    expect(finalized.histories).toHaveLength(1)
    expect(finalized.ancestryGraph.branches.map((branch) => branch.root)).toEqual(['black', 'bird'])
    expect(finalized.ancestryGraph.mergePoint?.form).toBe('blackbird')
    const duplicate = result(research)
    duplicate.histories![0].ancestryGraph = structuredClone(generated.ancestryGraph)
    duplicate.histories![0].ancestryGraph.branches[0].stages.push({
      stage: 'English',
      form: 'blackbird',
      note: 'duplicated whole form',
    })
    expect(() => finalizeResult(duplicate, research, 'standard')).toThrow(
      'whole compound duplicated'
    )
  })

  test('English cache validation rejects bilingual prose in nested histories', () => {
    const research = dickContext()
    const generated = result(research)
    expect(EtymologyResultSchema.safeParse(generated).success).toBe(true)
    const malformed = structuredClone(generated) as unknown as {
      histories: Array<{ lore: unknown }>
    }
    malformed.histories[0].lore = { en: 'bilingual prose in an English history' }
    expect(EtymologyResultSchema.safeParse(malformed).success).toBe(false)
  })

  test('displays only the selected English history and keeps legacy entries usable', () => {
    const generated = result(dickContext())
    generated.partsOfSpeech = [{ pos: 'verb', definition: 'primary verb meaning' }]
    generated.histories![0].partsOfSpeech = generated.partsOfSpeech
    expect(localizeHistoryChoices(generated).map((choice) => choice.label)).toEqual([
      'sense 1',
      'sense 2',
      'sense 3',
      'sense 4',
    ])
    const history = generated.histories![1]
    history.ancestryGraph = {
      branches: [
        { root: 'detective', stages: [{ stage: 'English', form: 'detective', note: 'clipping' }] },
      ],
    }
    const display = localizeResult(generated, 'en', history.id)
    expect(display.definition).toBe('definition 2')
    expect(display.lore).toBe('history 2')
    expect(display.partsOfSpeech).toBeUndefined()
    history.partsOfSpeech = [{ pos: 'noun', definition: 'a detective' }]
    expect(localizeResult(generated, 'en', history.id).partsOfSpeech).toEqual(history.partsOfSpeech)
    expect(
      display.ancestryGraph.branches.flatMap((branch) => branch.stages.map((stage) => stage.form))
    ).toEqual(['detective'])
    expect(localizeResult(generated).definition).toBe(generated.histories![0].definition)
    expect(localizeResult(generated).partsOfSpeech).toEqual(generated.partsOfSpeech)
    delete generated.histories
    delete generated.primaryHistoryId
    expect(localizeResult(generated).definition).toBe('wrong projection')
    expect(localizeResult(generated).partsOfSpeech).toEqual(generated.partsOfSpeech)
  })
})
