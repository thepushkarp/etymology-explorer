import { afterEach, expect, test } from 'bun:test'
import { createLexemeResearchSession, researchLexemeKey } from './lexemeResearch'
import { SourceFetchBudget } from './sourceFetchBudget'
import { ancestorCandidates, expandLexemes, hasCredibleMainSource } from './research'
import { parseDictionaryText } from './etymologyParser'
import type { ExaBudgetRedis } from './exaBudget'
import type { ResearchContext, StreamEvent } from './types'

const originalFetch = globalThis.fetch
const originalExaKey = process.env.EXA_API_KEY
const originalExaEnabled = process.env.EXA_ENABLED
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalExaKey === undefined) delete process.env.EXA_API_KEY
  else process.env.EXA_API_KEY = originalExaKey
  if (originalExaEnabled === undefined) delete process.env.EXA_ENABLED
  else process.env.EXA_ENABLED = originalExaEnabled
})

function serve(
  respond: (url: URL, init?: RequestInit) => Response | Promise<Response> = () =>
    new Response('', { status: 404 })
) {
  const requests: URL[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (process.env.KV_REST_API_URL && url.origin === new URL(process.env.KV_REST_API_URL).origin) {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      return Response.json(
        Array.isArray(body?.[0]) ? body.map(() => ({ result: null })) : { result: null }
      )
    }
    requests.push(url)
    return respond(url, init)
  }) as typeof fetch
  return requests
}

function context(word = 'fixture'): ResearchContext {
  return {
    language: 'en',
    mainWord: { word, etymonline: null, wiktionary: null },
    identifiedRoots: [],
    rootResearch: [],
    relatedResearch: [],
    totalSourcesFetched: 0,
  }
}

const allowance: ExaBudgetRedis = {
  async eval(_script, _keys, args) {
    return args.length === 4 ? 'reserved' : 1
  },
  async hgetall() {
    return null
  },
}

test.each([
  ['en', 'ahdictionary.com'],
  ['it', 'dizionario.internazionale.it'],
  ['es', 'dle.rae.es'],
  ['fr', 'www.cnrtl.fr'],
  ['pt', 'dicionario.priberam.org'],
] as const)(
  '%s combines general and language-specific sources and memoizes the whole lexeme',
  async (language, specialist) => {
    const requests = serve()
    const budget = new SourceFetchBudget(32)
    const session = createLexemeResearchSession({ budget, exaBudgetClient: null })
    const first = await session.lookup({ word: 'fixture', language })
    const before = requests.length
    const again = await session.lookup({ word: 'FIXTURE', language })
    expect(again).toBe(first)
    expect(requests.length).toBe(before)
    const hosts = requests.map((url) => url.hostname)
    expect(hosts).toContain('en.wiktionary.org')
    expect(hosts).toContain(`${language}.wikipedia.org`)
    expect(hosts).toContain(specialist)
    if (language !== 'en') expect(hosts).toContain(`${language}.wiktionary.org`)
    if (language === 'pt') expect(hosts).toContain('michaelis.uol.com.br')
    if (language === 'es') expect(hosts).toContain('www.asale.org')
    expect(budget.attempts).toBeLessThanOrEqual(32)
  }
)

test('historical lexemes query their specialist plus selected English Wiktionary and Wikipedia', async () => {
  const requests = serve()
  const budget = new SourceFetchBudget(32)
  const session = createLexemeResearchSession({ budget, exaBudgetClient: null })
  await session.lookupMany([
    { word: 'casa', language: 'Latin' },
    { word: 'hūs', language: 'Old English' },
    { word: 'λόγος', language: 'Ancient Greek' },
  ])
  expect(requests.filter((url) => url.hostname === 'en.wiktionary.org')).toHaveLength(3)
  expect(requests.filter((url) => url.hostname === 'en.wikipedia.org')).toHaveLength(3)
  expect(requests.filter((url) => url.hostname === 'anastrophe.uchicago.edu')).toHaveLength(2)
  expect(requests.filter((url) => url.hostname === 'bosworthtoller.com')).toHaveLength(1)
  expect(researchLexemeKey({ word: 'casa', language: 'Latin' })).not.toBe(
    researchLexemeKey({ word: 'casa', language: 'it' })
  )
})

test('unique ancestor limit preserves every history binding and round-robin source admission', async () => {
  const requests = serve()
  const research = context()
  const chain = parseDictionaryText(
    'From Latin casa, from Latin domus, from Old English hūs, from Ancient Greek λόγος, from Latin villa.',
    'fixture',
    'wiktionary'
  )
  research.parsedChains = [
    {
      ...chain,
      historyId: 'first',
      evidenceScopeId: 'first-scope',
      links: Array(5).fill(chain.links[0]),
    },
    { ...chain, historyId: 'second', evidenceScopeId: 'second-scope' },
  ]
  const candidates = ancestorCandidates(research)
  expect(new Set(candidates.map((candidate) => researchLexemeKey(candidate.lexeme))).size).toBe(4)
  expect(
    candidates
      .filter((candidate) => candidate.lexeme.word === 'casa')
      .map((candidate) => candidate.parentHistoryId)
  ).toEqual(['first', 'second'])
  const budget = new SourceFetchBudget(4)
  const session = createLexemeResearchSession({ budget, exaBudgetClient: null })
  await expandLexemes(research, budget, undefined, session)
  expect(
    research.rootResearch.filter((root) => root.root === 'casa').map((root) => root.parentHistoryId)
  ).toEqual(['first', 'second'])
  expect(requests).toHaveLength(4)
  expect(new Set(requests.map((url) => url.searchParams.get('page'))).size).toBe(4)
  expect(research.sourceOutcomes?.some(({ outcome }) => outcome.status === 'budget_skipped')).toBe(
    true
  )
})

test('a later variant retains its own binding when its target was already researched', async () => {
  const requests = serve((url) => {
    if (url.hostname === 'en.wikipedia.org') {
      const query = url.searchParams.get('titles')!
      return Response.json({
        query: {
          redirects: query === 'beta' ? [{ from: 'beta', to: 'alpha' }] : [],
          pages: [
            {
              title: 'alpha',
              ns: 0,
              extract: 'An independent encyclopedic description.',
              fullurl: 'https://en.wikipedia.org/wiki/alpha',
            },
          ],
        },
      })
    }
    return new Response('', { status: 404 })
  })
  const research = context('alpha beta')
  const budget = new SourceFetchBudget(32)
  const session = createLexemeResearchSession({ budget, exaBudgetClient: null })
  await expandLexemes(research, budget, undefined, session)
  expect(
    research.rootResearch.some((root) => root.root === 'alpha' && root.relationship === 'component')
  ).toBe(true)
  expect(
    research.rootResearch.some(
      (root) =>
        root.root === 'alpha' && root.relationship === 'redirect' && root.variantOf?.word === 'beta'
    )
  ).toBe(true)
  expect(
    requests.filter(
      (url) => url.hostname === 'en.wikipedia.org' && url.searchParams.get('titles') === 'alpha'
    )
  ).toHaveLength(1)
})

test('an empty etymology heading triggers discovery and verified publisher text remains contextual', async () => {
  process.env.EXA_API_KEY = 'test-exa-key'
  process.env.EXA_ENABLED = 'true'
  const requests = serve((url) => {
    if (url.hostname === 'en.wiktionary.org')
      return Response.json({
        parse: {
          title: 'fixture',
          text: '<h2 id="English">English</h2><h3 id="Etymology">Etymology</h3><p>Unknown.</p>',
          tocdata: {
            sections: [
              { index: '1', line: 'English', anchor: 'English', hLevel: 2, number: '1' },
              { index: '2', line: 'Etymology', anchor: 'Etymology', hLevel: 3, number: '1.1' },
            ],
          },
        },
      })
    if (url.hostname === 'api.exa.ai')
      return Response.json({
        results: [
          {
            url: 'https://ahdictionary.com/word/search.html?q=fixture',
            title: 'fixture - American Heritage',
            text: '<h1>fixture</h1><p>A complete historical discussion whose exact entry sections were flattened.</p>',
          },
          {
            url: 'https://ahdictionary.com/word/search.html?q=unrelated',
            title: 'fixture - American Heritage',
            text: 'Wrong URL identity.',
          },
        ],
        statuses: [],
        costDollars: { total: 0.007 },
      })
    return new Response('', { status: 404 })
  })
  const session = createLexemeResearchSession({
    budget: new SourceFetchBudget(32),
    exaBudgetClient: allowance,
  })
  const result = await session.lookup({ word: 'fixture', language: 'en' })
  expect(
    requests.filter((url) => url.hostname === 'api.exa.ai' && url.pathname === '/search')
  ).toHaveLength(1)
  const recovered = result.sources.find((source) => source.provider === 'americanHeritage')!
  expect(recovered.evidenceRole ?? recovered.data.evidenceRole).toBe('context')
  expect(recovered.data.retrieval?.method).toBe('exa')
  expect(result.sources.some((source) => source.data.text.includes('Wrong URL identity.'))).toBe(
    false
  )
  const onlyContext = context()
  onlyContext.mainWord.sources = [recovered]
  expect(hasCredibleMainSource(onlyContext)).toBe(false)
})

test('a blocked Etymonline source remains blocked when Exa is disabled', async () => {
  process.env.EXA_ENABLED = 'false'
  serve(
    (url) =>
      new Response('', {
        status: url.hostname === 'www.etymonline.com' ? 403 : 404,
        headers: { 'cf-mitigated': 'challenge' },
      })
  )
  const events: StreamEvent[] = []
  const session = createLexemeResearchSession({
    budget: new SourceFetchBudget(32),
    exaBudgetClient: null,
    onProgress: (event) => events.push(event),
  })
  await session.lookup({ word: 'fixture', language: 'en' }, { primary: true })
  const outcomes = events.filter(
    (event) => event.type === 'source_outcome' && event.source === 'etymonline'
  )
  expect(outcomes.at(-1)).toMatchObject({ outcome: { status: 'blocked' } })
})
