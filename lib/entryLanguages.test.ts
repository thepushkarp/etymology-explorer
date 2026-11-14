import { afterEach, expect, spyOn, test } from 'bun:test'
import { resolveEntryLanguages } from './entryLanguages'
import { createLexemeResearchSession } from './lexemeResearch'
import { fetchSelectedWiktionaryLanguage, fetchWiktionaryPage } from './wiktionary'
import { SourceFetchBudget } from './sourceFetchBudget'
import * as sourceCache from './sourceCache'
import type { ScriptTarget, SourceData, StreamEvent } from './types'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

function page(headings: string[], word = 'fixture') {
  return {
    parse: {
      title: word,
      revid: 42,
      text: headings
        .map(
          (heading, index) =>
            `<h2 id="language-${index}">${heading}</h2><p>A lexical definition with its final reference.</p>`
        )
        .join(''),
      tocdata: {
        sections: headings.map((heading, index) => ({
          line: heading,
          index: String(index + 1),
          number: String(index + 1),
          anchor: `language-${index}`,
          hLevel: 2,
        })),
      },
    },
  }
}

function serve(respond: (url: URL) => Response) {
  const requests: URL[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    requests.push(url)
    return respond(url)
  }) as typeof fetch
  return requests
}

function session(onProgress?: (event: StreamEvent) => void) {
  return createLexemeResearchSession({
    budget: new SourceFetchBudget(96),
    exaBudgetClient: null,
    onProgress,
  })
}

test('resolution includes English sections, native-only entries, hints and ordered unsupported headings', async () => {
  const requests = serve((url) => {
    if (url.hostname === 'en.wiktionary.org')
      return Response.json(page(['English', 'German', 'Latin']))
    if (url.hostname === 'it.wiktionary.org') return Response.json(page(['Italiano']))
    if (url.hostname === 'fr.wiktionary.org') return Response.json(page(['fran&#231;ais']))
    return new Response('', { status: 404 })
  })
  const shared = session()
  expect(await resolveEntryLanguages('fixture', shared, 'es')).toEqual({
    languages: ['en', 'it', 'es', 'fr'],
    otherLanguages: ['German', 'Latin'],
  })
  expect(requests).toHaveLength(5)
  expect(requests.filter((url) => url.hostname === 'en.wiktionary.org')).toHaveLength(1)
  expect(shared.getBudget().attempts).toBe(5)
})

test('full language lookups reuse resolution pages and emit progress for each query language', async () => {
  const events: StreamEvent[] = []
  const requests = serve((url) =>
    url.hostname === 'en.wiktionary.org'
      ? Response.json(page(['English', 'French']))
      : url.hostname === 'fr.wiktionary.org'
        ? Response.json(page(['Français']))
        : new Response('', { status: 404 })
  )
  const shared = session((event) => events.push(event))
  const resolved = await resolveEntryLanguages('fixture', shared)
  expect(resolved.languages).toEqual(['en', 'fr'])
  const before = requests.filter((url) => url.hostname.endsWith('.wiktionary.org')).length
  const results = await shared.lookupMany(
    resolved.languages.map((language) => ({ word: 'fixture', language })),
    { primary: true }
  )
  expect(results.map((result) => result.lexeme.language)).toEqual(['en', 'fr'])
  expect(
    results[1].sources.find((source) => source.provider === 'wiktionaryEnglish')?.data.text
  ).toContain('final reference')
  expect(requests.filter((url) => url.hostname.endsWith('.wiktionary.org'))).toHaveLength(before)
  expect(
    events.filter(
      (event) => event.type === 'source_started' && event.source === 'wiktionaryEnglish'
    )
  ).toEqual([
    {
      type: 'source_started',
      source: 'wiktionaryEnglish',
      language: 'fr',
      activityId: expect.any(String),
    },
  ])
})

test('authoritative Latin misses fall back to English, while unsupported or mixed scripts fetch nothing', async () => {
  const requests = serve(() => new Response('', { status: 404 }))
  expect(await resolveEntryLanguages('fixture', session())).toEqual({
    languages: ['en'],
    otherLanguages: [],
  })
  const before = requests.length
  expect(await resolveEntryLanguages('привет', session())).toEqual({
    languages: [],
    otherLanguages: [],
  })
  expect(await resolveEntryLanguages('chat漢', session())).toEqual({
    languages: [],
    otherLanguages: [],
  })
  expect(requests).toHaveLength(before)
})

test('transient resolution failures remain incomplete and never establish absence', async () => {
  serve(() => new Response('', { status: 503 }))
  expect(await resolveEntryLanguages('fixture', session())).toEqual({
    languages: ['en'],
    otherLanguages: [],
    incomplete: true,
  })
})

test('resolution redirects stop at the first-language ceiling, then research retains the consumed attempts', async () => {
  const requests = serve(
    () => new Response(null, { status: 302, headers: { location: '/redirect' } })
  )
  const shared = session()
  expect((await resolveEntryLanguages('fixture', shared)).incomplete).toBe(true)
  expect(requests.length).toBeGreaterThan(0)
  expect(requests.length).toBeLessThanOrEqual(32)
  expect(shared.getBudget().attempts).toBe(requests.length)
  shared.getBudget().tighten(48)
  expect(shared.getBudget().remaining).toBe(48 - requests.length)
})

test('a raw transient failure can have one shared ancestor retry without duplicating successful downloads', async () => {
  let attempts = 0
  serve(() =>
    ++attempts === 1 ? new Response('', { status: 503 }) : Response.json(page(['Latin']))
  )
  const shared = session()
  await expect(
    fetchWiktionaryPage('fixture', 'en', undefined, { fetchOnce: shared.fetchOnce })
  ).rejects.toThrow('503')
  const [first, second] = await Promise.all(
    [1, 2].map(() =>
      fetchSelectedWiktionaryLanguage('fixture', 'Latin', undefined, {
        fetchOnce: shared.fetchOnce,
        retryTransient: true,
      })
    )
  )
  expect(first?.revisionId).toBe(42)
  expect(second).toEqual(first)
  expect(attempts).toBe(2)
})

test('headings without lexical body text do not attest a language', async () => {
  serve((url) => {
    if (url.hostname !== 'en.wiktionary.org') return new Response('', { status: 404 })
    const response = page(['French'])
    response.parse.text =
      '<h2><span id="language-0">French</span></h2><h3 id="Etymology">Etymology</h3>'
    response.parse.tocdata.sections.push({
      line: 'Etymology',
      index: '2',
      number: '1.1',
      anchor: 'Etymology',
      hLevel: 3,
    })
    return Response.json(response)
  })
  expect(await resolveEntryLanguages('fixture', session())).toEqual({
    languages: ['en'],
    otherLanguages: [],
  })
})

test('persisted language TOCs resolve a warm spelling without source HTTP attempts', async () => {
  const requests = serve(() => {
    throw new Error('Warm resolution must not fetch')
  })
  const cached = spyOn(sourceCache, 'getCachedWiktionaryToc').mockImplementation(
    async (_word, edition) =>
      edition === 'en'
        ? { headings: ['French', 'German'], nonemptyHeadings: ['French', 'German'] }
        : { headings: [], nonemptyHeadings: [] }
  )
  try {
    const shared = session()
    expect(await resolveEntryLanguages('fixture', shared)).toEqual({
      languages: ['fr'],
      otherLanguages: ['German'],
    })
    expect(requests).toHaveLength(0)
    expect(shared.getBudget().attempts).toBe(0)
  } finally {
    cached.mockRestore()
  }
})

test('Indic resolution reuses native Hindi and English pages without merging language histories', async () => {
  const requests = serve((url) =>
    url.hostname === 'en.wiktionary.org'
      ? Response.json(page(['Hindi', 'Sanskrit', 'Nepali'], 'नमस्ते'))
      : url.hostname === 'hi.wiktionary.org'
        ? Response.json(page(['हिंदी'], 'नमस्ते'))
        : new Response('', { status: 404 })
  )
  const shared = session()
  expect(await resolveEntryLanguages('नमस्ते', shared)).toEqual({
    languages: ['hi', 'sa'],
    otherLanguages: ['Nepali'],
  })
  const lookups = await shared.lookupMany(
    [
      { word: 'नमस्ते', language: 'hi' },
      { word: 'नमस्ते', language: 'sa' },
    ],
    { skipOptionalSources: true }
  )
  expect(lookups[0].sources.map((source) => source.provider)).toEqual([
    'wiktionaryEnglish',
    'wiktionaryNative',
  ])
  expect(lookups[1].sources.map((source) => source.provider)).toEqual(['wiktionaryEnglish'])
  expect(requests.map((url) => url.hostname).sort()).toEqual([
    'en.wiktionary.org',
    'hi.wiktionary.org',
  ])
})

function romanizationPage() {
  const response = page(['English', 'Japanese'], 'tsunami')
  response.parse.text =
    '<h2 id="language-0">English</h2><p>A large sea wave.</p>' +
    '<h2 id="language-1">Japanese</h2><h3 id="Romanization">Romanization</h3>' +
    '<p><span class="headword-line"><strong class="Latn headword" lang="ja">tsunami</strong></span></p>' +
    '<ol><li><span class="form-of-definition">Rōmaji transcription of ' +
    '<span class="form-of-definition-link"><i lang="ja"><a href="/wiki/つなみ#Japanese">つなみ</a></i></span></span></li></ol>'
  response.parse.tocdata.sections.push({
    line: 'Romanization',
    index: '3',
    number: '2.1',
    anchor: 'Romanization',
    hLevel: 3,
  })
  return response
}

test('romanization offers retain English and enrich redirects only from warm sources', async () => {
  const expected: ScriptTarget[] = [
    { word: 'つなみ', language: 'ja' },
    { word: '津波', language: 'ja' },
  ]
  const tocs = new Map<string, sourceCache.WiktionaryToc>()
  const sources = new Map<string, SourceData>()
  const spies = [
    spyOn(sourceCache, 'getCachedWiktionaryToc').mockImplementation(
      async (word, edition = 'en') => tocs.get(`${edition}:${word}`) ?? null
    ),
    spyOn(sourceCache, 'cacheWiktionaryToc').mockImplementation(async (word, edition, toc) => {
      tocs.set(`${edition}:${word}`, toc)
    }),
    spyOn(sourceCache, 'getCachedSource').mockImplementation(
      async (source, word) => sources.get(`${source}:${word}`) ?? null
    ),
    spyOn(sourceCache, 'cacheSource').mockImplementation(async (source, word, data) => {
      sources.set(`${source}:${word}`, data)
    }),
  ]
  try {
    const requests = serve((url) => {
      if (url.hostname !== 'en.wiktionary.org') return new Response('', { status: 404 })
      if (url.searchParams.get('page') === 'tsunami') return Response.json(romanizationPage())
      const response = page(['Japanese'], 'つなみ')
      response.parse.text =
        '<h2 id="language-0">Japanese</h2><table class="wikitable ja-see"><tr><td>' +
        '<b>For pronunciation and definitions of <span lang="ja">つなみ</span> – see the following entry.</b></td></tr>' +
        '<tr><td><span lang="ja">【<a href="/wiki/津波#Japanese">津波</a>】</span></td><td>' +
        '<a href="/wiki/海嘯#Japanese">海嘯</a> in another definition</td></tr></table>'
      return Response.json(response)
    })
    const shared = session()
    expect(await resolveEntryLanguages('tsunami', shared)).toEqual({
      languages: ['en'],
      otherLanguages: [],
      otherScripts: expected.slice(0, 1),
    })
    expect(requests.filter((url) => url.searchParams.get('page') === 'つなみ')).toHaveLength(0)
    expect(requests.some((url) => url.searchParams.get('page') === '津波')).toBe(false)
    await fetchSelectedWiktionaryLanguage('つなみ', 'Japanese')
    const before = requests.length
    const warm = session()
    const hinted = await resolveEntryLanguages('tsunami', warm, 'ja')
    expect(hinted.languages).toEqual(['en'])
    expect(hinted.otherScripts).toEqual(expected)
    expect(requests).toHaveLength(before)
    expect(warm.getBudget().attempts).toBe(0)
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
})

test('an uncached optional redirect cannot mark the English entry incomplete', async () => {
  serve((url) => {
    if (url.hostname !== 'en.wiktionary.org') return new Response('', { status: 404 })
    return url.searchParams.get('page') === 'tsunami'
      ? Response.json(romanizationPage())
      : new Response('', { status: 503 })
  })
  expect(await resolveEntryLanguages('tsunami', session())).toEqual({
    languages: ['en'],
    otherLanguages: [],
    otherScripts: [{ word: 'つなみ', language: 'ja' }],
  })
})
