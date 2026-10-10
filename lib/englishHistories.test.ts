import { describe, expect, test } from 'bun:test'
import { scopeEnglishHistories, buildResearchPrompt } from './research'
import { finalizeResult } from './llm'
import { buildSynthesisRequest } from './openrouterResponses'
import { ENGLISH_HISTORY_ETYMOLOGY_LLM_SCHEMA } from './schemas/llm-schema'
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
    expect(research.lexicalGraph!.histories).toHaveLength(4)
    expect(new Set(research.entryContexts!.map((entry) => entry.evidenceScopeId)).size).toBe(4)
    expect(research.entryContexts![0].text).toContain('vulgar and verb senses')
    expect(research.entryContexts![1].text).not.toContain('Rihhart')
    expect(research.parsedChains![0].historyId).toBe(research.entryContexts![0].id)
    expect(buildResearchPrompt(research)).toContain(`history_id="${research.entryContexts![0].id}"`)
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

  test('rejects repeated Rihhart routes within one history', () => {
    const research = dickContext()
    const generated = result(research)
    const stages = [{ stage: 'Old High German', form: 'Rihhart', note: 'name' }]
    generated.histories![0].ancestryGraph.branches = [
      { root: 'Richard', stages },
      { root: 'Dick', stages: structuredClone(stages) },
    ]
    expect(() => finalizeResult(generated, research, 'standard')).toThrow(
      'duplicated ancestry branch'
    )
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

  test('linked variant phrases and competing origins do not need a CPU compound formula', () => {
    const research = context('plot armour', ['Alternative spelling of plot armor.'])
    const generated = result(research)
    generated.histories![0].ancestryGraph = {
      branches: [
        { root: 'plot', stages: [{ stage: 'English', form: 'plot', note: 'story' }] },
        { root: 'armour', stages: [{ stage: 'English', form: 'armour', note: 'protection' }] },
      ],
      mergePoint: { form: 'plot armour', note: 'phrase' },
    }
    expect(() => finalizeResult(generated, research, 'standard')).not.toThrow()
    delete generated.histories![0].ancestryGraph.mergePoint
    expect(() => finalizeResult(generated, research, 'standard')).not.toThrow()
  })

  test('English strict history output preserves string prose and cache validates nested histories', () => {
    const research = dickContext()
    const generated = result(research)
    const format = buildSynthesisRequest('fixture', undefined, 'en', true).text.format
    expect(format.type).toBe('json_schema')
    expect('schema' in format && format.schema).toEqual(ENGLISH_HISTORY_ETYMOLOGY_LLM_SCHEMA)
    expect(EtymologyResultSchema.safeParse(generated).success).toBe(true)
    const malformed = structuredClone(generated) as unknown as {
      histories: Array<{ lore: unknown }>
    }
    malformed.histories[0].lore = { en: 'bilingual prose in an English history' }
    expect(EtymologyResultSchema.safeParse(malformed).success).toBe(false)
  })
})
