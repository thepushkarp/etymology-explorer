import { afterEach, expect, spyOn, test } from 'bun:test'
import { resolveEntryIdentity } from './entryIdentity'
import { createLexemeResearchSession } from './lexemeResearch'
import { SourceFetchBudget } from './sourceFetchBudget'
import * as sourceCache from './sourceCache'
import type { SourceData } from './types'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

function session() {
  return createLexemeResearchSession({
    budget: new SourceFetchBudget(96),
    exaBudgetClient: null,
  })
}

function page(word: string, target?: string, kind = 'Alternative spelling') {
  return {
    parse: {
      title: word,
      revid: 42,
      text:
        '<h2 id="Japanese">Japanese</h2><h3 id="Noun">Noun</h3>' +
        `<p><strong class="Jpan headword" lang="ja">${word}</strong></p><ol><li>` +
        (target
          ? `<span class="form-of-definition">${kind} of <span class="form-of-definition-link"><i lang="ja"><a href="/wiki/${target}#Japanese">${target}</a></i></span></span>`
          : 'A sea wave.') +
        '</li></ol>',
      tocdata: {
        sections: [
          { index: '1', line: 'Japanese', anchor: 'Japanese', hLevel: 2, number: '1' },
          { index: '2', line: 'Noun', anchor: 'Noun', hLevel: 3, number: '1.1' },
        ],
      },
    },
  }
}

test('source-confirmed chains share fetched pages and retain misspelling and terminal freshness', async () => {
  const sources = new Map<string, SourceData>()
  const spies = [
    spyOn(sourceCache, 'getCachedSource').mockImplementation(
      async (_source, word) => sources.get(word) ?? null
    ),
    spyOn(sourceCache, 'cacheSource').mockImplementation(async (_source, word, data) => {
      sources.set(word, data)
    }),
    spyOn(sourceCache, 'cacheWiktionaryToc').mockResolvedValue(undefined),
  ]
  let requests = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests++
    const word = new URL(input instanceof Request ? input.url : String(input)).searchParams.get(
      'page'
    )!
    return Response.json(
      word === 'ツナミ'
        ? page(word, 'つなみ', 'Misspelling')
        : word === 'つなみ'
          ? page(word, '津波')
          : page(word)
    )
  }) as typeof fetch
  try {
    const shared = session()
    expect((await resolveEntryIdentity('tsunami', shared, 'ja')).word).toBe('tsunami')
    expect(requests).toBe(0)
    const resolved = await resolveEntryIdentity('ツナミ', shared, 'ja')
    expect(resolved.word).toBe('津波')
    expect(resolved.spellings.map(({ word, kind }) => ({ word, kind }))).toEqual([
      { word: 'ツナミ', kind: 'misspelling' },
      { word: 'つなみ', kind: 'spelling' },
    ])
    expect(shared.getBudget().attempts).toBe(3)
    const terminal = sources.get('津波')!
    terminal.retrieval!.retrievedAt = new Date(Date.now() - 60_000).toISOString()
    const warm = session()
    const cached = await resolveEntryIdentity('ツナミ', warm)
    expect(
      cached.spellings.every((spelling) => spelling.verifiedAt === terminal.retrieval!.retrievedAt)
    ).toBe(true)
    expect(warm.getBudget().attempts).toBe(0)
    expect(requests).toBe(3)
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
})

test('cycles and unverified terminals preserve the requested identity; source failure stays retryable', async () => {
  const cached = spyOn(sourceCache, 'getCachedSource').mockImplementation(
    async (_source, word) => ({
      text: 'Source text',
      url: 'https://en.wiktionary.org/wiki/' + encodeURIComponent(word),
      retrieval: { method: 'direct', retrievedAt: new Date().toISOString() },
      ...(word === 'つなみ'
        ? { spellingRedirect: { word: '津波', language: 'ja', kind: 'spelling' } }
        : { spellingRedirect: { word: 'つなみ', language: 'ja', kind: 'spelling' } }),
    })
  )
  try {
    expect((await resolveEntryIdentity('つなみ', session(), 'ja')).word).toBe('つなみ')
    cached.mockImplementation(async (_source, word) => ({
      text: 'Ambiguous reading',
      url: 'https://en.wiktionary.org/wiki/' + encodeURIComponent(word),
      retrieval: { method: 'direct', retrievedAt: new Date().toISOString() },
      ...(word === 'つなみ'
        ? { spellingRedirect: { word: '津波', language: 'ja', kind: 'spelling' } }
        : {}),
    }))
    expect((await resolveEntryIdentity('つなみ', session(), 'ja')).word).toBe('つなみ')
    cached.mockResolvedValue(null)
    globalThis.fetch = (async () => new Response('', { status: 503 })) as unknown as typeof fetch
    expect(await resolveEntryIdentity('つなみ', session(), 'ja')).toEqual({
      word: 'つなみ',
      spellings: [],
      proofs: [],
      incomplete: true,
    })
  } finally {
    cached.mockRestore()
  }
})
