import { describe, expect, test } from 'bun:test'
import { finalizeResult } from './llm'
import { scopeEnglishHistories } from './research'
import { etymologyResult } from './testSupport/etymologyResult'
import { EtymologyResultSchema } from './schemas/etymology'
import { SOURCE_PROVIDER_IDS, sourceFamily, type SourceProviderId } from './sourceProviders'
import { lexicalSourceRecords, mainSourceRecords } from './researchSources'
import type { EtymologyResult, ResearchContext, SourceRecord } from './types'

function record(
  provider: SourceProviderId,
  url: string,
  text = 'A dictionary entry.'
): SourceRecord {
  return { provider, sourceFamily: sourceFamily(provider), data: { text, url } }
}

const ENTRY = {
  word: 'nice',
  pronunciation: '/naɪs/',
  definition: 'Pleasant.',
  lore: 'Origin uncertain.',
}

/** Scope the research's histories, then finalize a synthesis that covers each of them. */
function finalize(context: ResearchContext): EtymologyResult {
  scopeEnglishHistories(context)
  return finalizeResult(etymologyResult(ENTRY, context), context, 'standard')
}

function fixture(): { result: EtymologyResult; context: ResearchContext } {
  return {
    result: etymologyResult(ENTRY),
    context: {
      language: 'en',
      mainWord: { word: 'nice', etymonline: null, wiktionary: null },
      rootResearch: [],
      relatedResearch: [],
      identifiedRoots: [],
      totalSourcesFetched: 0,
    },
  }
}

describe('canonical research sources', () => {
  test('attributes query, ancestor, and related publishers with entry URLs and independent families', () => {
    const { context } = fixture()
    const sharedPortal = 'https://www.cnrtl.fr/etymologie/nice'
    context.mainWord.sources = [record('tlfi', sharedPortal), record('littre', sharedPortal)]
    const historical = record('bosworthToller', 'https://bosworthtoller.com/28714')
    historical.data.entryGroups = [
      {
        index: 'supplement',
        number: '2',
        heading: 'STÁN',
        anchor: 'supplement',
        level: 2,
        text: 'A supplement.',
        sections: [],
        sourceUrl: 'https://bosworthtoller.com/58460',
      },
    ]
    context.rootResearch = [
      {
        root: 'stān',
        lexeme: { word: 'stān', language: 'Old English' },
        sources: [historical],
        etymonlineData: null,
        wiktionaryData: null,
        relatedTerms: [],
      },
    ]
    context.relatedResearch = [
      {
        term: 'pleasant',
        sources: [
          record('americanHeritage', 'https://ahdictionary.com/word/search.html?q=pleasant'),
        ],
        etymonlineData: null,
      },
    ]
    const finalized = finalize(context)
    expect(finalized.sources.map(({ name }) => name)).toEqual([
      'tlfi',
      'littre',
      'bosworthToller',
      'bosworthToller',
      'americanHeritage',
    ])
    expect(finalized.sources[0].sourceFamily).toBe('tlfi')
    expect(finalized.sources[1].sourceFamily).toBe('littre')
    expect(finalized.sources[3]).toMatchObject({
      word: 'stān',
      url: 'https://bosworthtoller.com/58460',
    })
  })

  test('canonical collections override named projections and duplicate retrievals add no citation', () => {
    const { context } = fixture()
    context.mainWord.etymonline = {
      text: 'Stale projection.',
      url: 'https://www.etymonline.com/word/nice',
    }
    context.mainWord.sources = []
    expect(mainSourceRecords(context.mainWord)).toEqual([])
    expect(finalize(context).sources).toEqual([{ name: 'synthesized' }])
    const direct = record('etymonline', 'https://www.etymonline.com/word/nice')
    const recovered = structuredClone(direct)
    recovered.data.retrieval = { method: 'exa', retrievedAt: '2026-11-04T00:00:00Z' }
    context.mainWord.sources = [direct, recovered]
    expect(finalize(context).sources).toHaveLength(1)
  })

  test('encyclopedia and senses-only evidence cannot masquerade as etymology', () => {
    const dictionary = record(
      'americanHeritage',
      'https://ahdictionary.com/word/search.html?q=nice'
    )
    const senses = record('multilingualDictionary', 'https://freedictionaryapi.com')
    const context = record('wikipedia', 'https://en.wikipedia.org/wiki/Nice')
    context.evidenceRole = 'etymology'
    const records = [dictionary, senses, context]
    expect(lexicalSourceRecords(records).map(({ provider }) => provider)).toEqual([
      'americanHeritage',
      'multilingualDictionary',
    ])
  })

  test('cache validation retains verified publisher identities and families', () => {
    const { result } = fixture()
    result.sources = SOURCE_PROVIDER_IDS.map((provider) => ({
      name: provider,
      sourceFamily: sourceFamily(provider),
    }))
    expect(EtymologyResultSchema.parse(result).sources).toEqual(result.sources)
    expect(EtymologyResultSchema.safeParse({ ...result, sources: [{ name: 'exa' }] }).success).toBe(
      false
    )
  })
})
