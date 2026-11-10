import { afterEach, expect, test } from 'bun:test'
import fixtures from './__fixtures__/japanese/wiktionary.json'
import jisho from './__fixtures__/jmdict/jisho.json'
import { extractWiktionaryEntryGroups, extractWiktionaryVariants } from './wiktionaryEntryGroups'
import { ancestorCandidates, expandLexemes, scopeEnglishHistories } from './research'
import { createLexemeResearchSession } from './lexemeResearch'
import { SourceFetchBudget } from './sourceFetchBudget'
import { finalizeResult } from './llm'
import { parseJmdictResponse } from './jmdict'
import { etymologyResult } from './testSupport/etymologyResult'
import { canonicalizeWord } from './orthography'
import { candidateLanguages, type LanguageCode } from './languages'
import { isValidWord } from './validation'
import type { AncestryGraph, ResearchContext, SourceRecord } from './types'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

function source(name: keyof typeof fixtures): SourceRecord {
  const fixture = fixtures[name]
  return {
    provider: 'wiktionaryEnglish',
    sourceFamily: 'wiktionary',
    evidenceRole: 'etymology',
    data: {
      text: fixture.html,
      url: fixture.url,
      requestedWord: fixture.word,
      resolvedWord: fixture.word,
      lexicalLanguage: fixture.language,
      entryGroups: extractWiktionaryEntryGroups(
        fixture.html,
        fixture.sections,
        fixture.language,
        /^Etymology(?: \d+)?$/,
        fixture.word
      ),
      variants: extractWiktionaryVariants(fixture.html, fixture.sections, fixture.language),
    },
  }
}

function context(name: keyof typeof fixtures, language: LanguageCode = 'ja'): ResearchContext {
  const record = source(name)
  const result: ResearchContext = {
    language,
    mainWord: { word: fixtures[name].word, etymonline: null, wiktionary: null, sources: [record] },
    identifiedRoots: [],
    rootResearch: [],
    relatedResearch: [],
    totalSourcesFetched: 0,
  }
  scopeEnglishHistories(result)
  return result
}

function result(research: ResearchContext, ancestryGraph: AncestryGraph) {
  const value = etymologyResult({ word: research.mainWord.word }, research)
  value.histories[0].ancestryGraph = structuredClone(ancestryGraph)
  return value
}

const stage = (language: string, form: string) => ({ stage: language, form, note: '' })

test('Japanese identity folds only half-width kana and accepts source spelling separators', () => {
  expect(canonicalizeWord(' ｻﾗﾘｰﾏﾝ ')).toBe('サラリーマン')
  expect(canonicalizeWord('ｶﾞ')).toBe('ガ')
  expect(canonicalizeWord('ﾏｲ･ﾌﾞｰﾑ')).toBe('マイ・ブーム')
  expect(canonicalizeWord('ﬀＡ')).toBe('ﬀａ')
  expect(isValidWord(canonicalizeWord('ﾏｲ･ﾌﾞｰﾑ'))).toBe(true)
  expect(isValidWord('・パン')).toBe(false)
  expect(candidateLanguages('サラリーマン')).toEqual(['ja'])
  expect(candidateLanguages('津波')).toEqual(['ja'])
})

test('a singleton donor history contributes ordered, source-scoped continuation only to its parent', async () => {
  const donor = fixtures['pt-pao']
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    return url.hostname === 'en.wiktionary.org' && url.searchParams.get('page') === donor.word
      ? Response.json({
          parse: { title: donor.word, text: donor.html, tocdata: { sections: donor.sections } },
        })
      : new Response('', { status: 404 })
  }) as typeof fetch
  const research = context('ja-pan')
  const budget = new SourceFetchBudget(32)
  await expandLexemes(research, budget, undefined, createLexemeResearchSession({ budget }))
  const graph = {
    branches: [
      {
        root: 'pão',
        stages: [
          stage('Latin', 'pānem'),
          stage('Old Galician-Portuguese', 'pan'),
          stage('Portuguese', 'pão'),
        ],
      },
    ],
  }
  const finalized = finalizeResult(result(research, graph), research, 'standard')
  const evidence = finalized.ancestryGraph.branches[0].stages[1].evidence![0]
  expect(evidence).toMatchObject({ source: 'wiktionaryEnglish', sourceUrl: donor.url })
  expect(evidence.evidenceScopeId).toContain('continuation:Portuguese:pão')
  expect(finalized.ancestryGraph.branches[0].stages[1].confidence).toBe('medium')
  expect(
    Object.values(research.lexicalGraph!.evidence).some(
      (entry) => entry.sourceUrl === donor.url && entry.evidenceScopeId === evidence.evidenceScopeId
    )
  ).toBe(true)
  const moved = result(research, graph)
  moved.histories[1].ancestryGraph = structuredClone(graph)
  expect(() => finalizeResult(moved, research, 'standard')).toThrow('another history')
  const reversed = result(research, graph)
  reversed.histories[0].ancestryGraph.branches[0].stages.reverse()
  expect(() => finalizeResult(reversed, research, 'standard')).toThrow('continuation')
})

test('multiple donor histories and donor compounds remain independent context', async () => {
  const donor = fixtures['pt-pao']
  for (const compound of [false, true]) {
    const extra = compound
      ? '<p>Compound of <i lang="pt">pão</i> + <i lang="pt">forma</i>.</p>'
      : '<h3 id="Etymology_2">Etymology 2</h3><p>Origin uncertain.</p>'
    const html = compound
      ? donor.html.replace('<h3 id="Pronunciation">', `${extra}<h3 id="Pronunciation">`)
      : donor.html + extra
    const sections = compound
      ? donor.sections
      : [
          ...donor.sections,
          {
            index: 'extra',
            line: 'Etymology 2',
            anchor: 'Etymology_2',
            hLevel: 3,
            number: 'extra',
          },
        ]
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      return url.hostname === 'en.wiktionary.org' && url.searchParams.get('page') === donor.word
        ? Response.json({ parse: { title: donor.word, text: html, tocdata: { sections } } })
        : new Response('', { status: 404 })
    }) as typeof fetch
    const research = context('ja-pan')
    const budget = new SourceFetchBudget(32)
    await expandLexemes(research, budget, undefined, createLexemeResearchSession({ budget }))
    expect(
      research.rootResearch.some((root) => root.lexeme?.word === 'pão' && root.sources?.length)
    ).toBe(true)
    expect(research.parsedChains?.some((chain) => chain.subject?.word === 'pão')).toBe(false)
  }
})

test('explicit wasei clipping keeps English components at the Japanese merge even without a model label', () => {
  const research = context('ja-consento')
  expect(() => finalizeResult(result(research, { branches: [] }), research, 'standard')).toThrow(
    'source-attested ancestry is missing'
  )
  const graph: AncestryGraph = {
    branches: ['concentric', 'plug'].map((form) => ({
      root: form,
      stages: [stage('English', form)],
    })),
    mergePoint: { form: 'コンセントリックプラグ', note: '' },
    postMerge: [stage('Japanese', 'コンセント')],
  }
  const finalized = finalizeResult(result(research, graph), research, 'standard')
  expect(
    finalized.ancestryGraph.branches.every((branch) => branch.stages[0].confidence === 'medium')
  ).toBe(true)
  expect(
    ancestorCandidates(research)
      .filter((candidate) => candidate.relationship === 'component')
      .map((candidate) => candidate.lexeme)
  ).toEqual([
    { word: 'concentric', language: 'English' },
    { word: 'plug', language: 'English' },
  ])
  const wrongMerge = result(research, graph)
  wrongMerge.histories[0].ancestryGraph.mergePoint!.form = 'concentric plug'
  expect(() => finalizeResult(wrongMerge, research, 'standard')).toThrow('merge')
  expect(() =>
    finalizeResult(
      result(research, {
        branches: [{ root: 'concentric', stages: [stage('English', 'concentric')] }],
      }),
      research,
      'standard'
    )
  ).toThrow('attested merge')
  const compoundOnly = context('ja-denwa')
  expect(() =>
    finalizeResult(
      result(compoundOnly, {
        branches: [{ root: '電話', stages: [stage('Middle Chinese', '電話')] }],
      }),
      compoundOnly,
      'standard'
    )
  ).toThrow('attested merge')
})

test('a kana redirect researches the exact lemma components and retains the queried final form', async () => {
  const lemma = fixtures['ja-tsunami']
  const requests: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    requests.push(url.searchParams.get('page') ?? '')
    return url.hostname === 'en.wiktionary.org' && url.searchParams.get('page') === lemma.word
      ? Response.json({
          parse: { title: lemma.word, text: lemma.html, tocdata: { sections: lemma.sections } },
        })
      : new Response('', { status: 404 })
  }) as typeof fetch
  const research = context('ja-tsunami-reading')
  const budget = new SourceFetchBudget(32)
  await expandLexemes(research, budget, undefined, createLexemeResearchSession({ budget }))
  expect(requests).toContain('津')
  expect(requests).toContain('波')
  const finalized = finalizeResult(
    result(research, {
      branches: ['津', '波'].map((form) => ({ root: form, stages: [stage('Japanese', form)] })),
      mergePoint: { form: '津波', note: '' },
      postMerge: [stage('Japanese', 'つなみ')],
    }),
    research,
    'standard'
  )
  expect(finalized.word).toBe('つなみ')
  expect(finalized.histories[0].formOf).toEqual({ word: '津波', language: 'ja' })
  expect(finalized.ancestryGraph.branches[0].stages[0].evidence?.[0].sourceUrl).toBe(lemma.url)
})

test('ordinary Japanese histories retain unmatched attested stages without a parser-completeness gate', () => {
  for (const [name, language, form] of [
    ['ja-arigatou', 'Old Japanese', 'ありがたし'],
    ['ja-terebi', 'Japanese', 'テレビジョン'],
  ] as const) {
    const research = context(name)
    const finalized = finalizeResult(
      result(research, { branches: [{ root: form, stages: [stage(language, form)] }] }),
      research,
      'standard'
    )
    expect(finalized.ancestryGraph.branches[0].stages[0].confidence).toBe('low')
  }
})

test('the disputed salaryman source retains its phrase account without adopting an unaligned wasei tag', () => {
  const research = context('ja-salaryman')
  const supplemental = parseJmdictResponse('サラリーマン', jisho['サラリーマン'].response)
  research.mainWord.sources!.push(...supplemental)
  scopeEnglishHistories(research)
  const value = result(research, {
    branches: [{ root: 'salaried man', stages: [stage('English', 'salaried man')] }],
  })
  value.histories[0].stratum = 'wasei-eigo'
  const finalized = finalizeResult(value, research, 'standard')
  expect(finalized.stratum).toBeUndefined()
  expect(finalized.ancestryGraph.branches[0].stages[0].confidence).toBe('medium')
  expect(
    finalized.ancestryGraph.branches[0].stages[0].evidence?.map((evidence) => evidence.source)
  ).toEqual(['wiktionaryEnglish'])
  const lexical = { ...research, mainWord: { ...research.mainWord, sources: supplemental } }
  scopeEnglishHistories(lexical)
  expect(lexical.entryContexts).toHaveLength(supplemental[0].data.entryGroups!.length)
  expect(new Set(lexical.entryContexts!.map((entry) => entry.evidenceScopeId)).size).toBe(
    lexical.entryContexts!.length
  )
})

test('classification uses the etymology boundary and is absent outside Japanese', () => {
  const research = context('ja-denwa')
  research.entryContexts![0].text += '\nNoun\nA hybrid device.'
  const graph: AncestryGraph = {
    branches: ['電', '話'].map((form) => ({ root: form, stages: [stage('Japanese', form)] })),
    mergePoint: { form: '電話', note: '' },
  }
  const value = result(research, graph)
  value.histories[0].stratum = 'hybrid'
  expect(finalizeResult(value, research, 'standard').stratum).toBeUndefined()
  const valid = result(research, graph)
  valid.histories[0].stratum = 'wasei-kango'
  expect(finalizeResult(valid, research, 'standard').stratum).toBe('wasei-kango')
  const portuguese = context('pt-pao', 'pt')
  const foreign = result(portuguese, {
    branches: [{ root: 'pan', stages: [stage('Old Galician-Portuguese', 'pan')] }],
  })
  foreign.histories[0].stratum = 'gairaigo'
  expect(finalizeResult(foreign, portuguese, 'standard').stratum).toBeUndefined()
})
