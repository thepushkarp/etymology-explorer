import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { createExaSession } from './exa'
import type { ExaBudgetRedis } from './exaBudget'
import { SourceFetchBudget } from './sourceFetchBudget'
import { safeError } from './errorUtils'

const domain = 'www.etymonline.com'
const url = `https://${domain}/word/nice`
const originalFetch = globalThis.fetch
const originalEnabled = process.env.EXA_ENABLED
const apiKey = 'test-exa-key-never-log'
let transactions: (string | number)[][]
let reserveStatus: string
const client: ExaBudgetRedis = {
  async eval(_script, _keys, args) {
    transactions.push(args)
    return args.length === 4 ? reserveStatus : 1
  },
  async hgetall() {
    return {}
  },
}
const makeSession = (budget = new SourceFetchBudget(32)) =>
  createExaSession({ allowedDomains: [domain], apiKey, budgetClient: client, sourceBudget: budget })

beforeEach(() => {
  process.env.EXA_ENABLED = 'true'
  transactions = []
  reserveStatus = 'reserved'
})
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalEnabled === undefined) delete process.env.EXA_ENABLED
  else process.env.EXA_ENABLED = originalEnabled
  mock.restore()
})

describe('Exa transport', () => {
  test('retains full contents, provenance, and provider cost within shared HTTP accounting', async () => {
    const text = '<h2>nice</h2>' + 'whole source text '.repeat(10000)
    const fetchMock = mock(async (_input: unknown, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        urls: [url],
        text: { includeHtmlTags: true, verbosity: 'full' },
      })
      expect(new Headers(init?.headers).get('x-api-key')).toBe(apiKey)
      return Response.json({
        results: [
          { url, text, title: 'nice' },
          { url: 'https://evil.example/word', text: 'bad' },
        ],
        requestId: 'request-1',
        statuses: [{ id: url, status: 'success', source: 'cached' }],
        costDollars: { total: 0.001 },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const budget = new SourceFetchBudget(32)
    const result = await makeSession(budget).contents([url, url])
    expect(result).toEqual({
      status: 'success',
      documents: [{ url, text, title: 'nice' }],
      statuses: [{ id: url, status: 'success', source: 'cached' }],
      requestId: 'request-1',
      costUSD: 0.001,
    })
    expect(budget.attempts).toBe(1)
    expect(transactions[0][1]).toBe(1000)
    expect(transactions[1].slice(1)).toEqual(['commit', 1000])
  })

  test('bounds parallel searches, contents pages, and total HTTP calls', async () => {
    const bodies: Record<string, unknown>[] = []
    globalThis.fetch = mock(async (_input: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return Response.json({ results: [] })
    }) as unknown as typeof fetch
    const session = makeSession()
    const searches = await Promise.all(
      Array.from({ length: 3 }, () => session.search('nice etymology', [domain]))
    )
    expect(searches.map((result) => result.status)).toEqual(['success', 'success', 'skipped'])
    expect(bodies[0]).toEqual({
      query: 'nice etymology',
      type: 'auto',
      numResults: 5,
      includeDomains: [domain],
      contents: { text: { includeHtmlTags: true, verbosity: 'full' } },
    })
    const pages = Array.from({ length: 8 }, (_, i) => `${url}${i}`)
    expect((await session.contents(pages)).status).toBe('success')
    expect(await session.contents([url])).toEqual({ status: 'skipped', reason: 'content_limit' })
    expect(
      transactions
        .filter((args) => args.length === 4)
        .reduce((sum, args) => sum + Number(args[1]), 0)
    ).toBe(22000)
    const second = makeSession()
    const calls = await Promise.all(Array.from({ length: 6 }, () => second.contents([url])))
    expect(calls.filter((result) => result.status === 'success')).toHaveLength(5)
    expect(calls[5]).toEqual({ status: 'skipped', reason: 'request_limit' })
  })

  test('disabled, exhausted, missing-ledger and unapproved source calls spend nothing', async () => {
    const fetchMock = mock(() => {
      throw new Error('Must not fetch')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    process.env.EXA_ENABLED = 'false'
    expect(await makeSession().contents([url])).toEqual({ status: 'skipped', reason: 'disabled' })
    process.env.EXA_ENABLED = 'true'
    expect(await makeSession(new SourceFetchBudget(0)).contents([url])).toEqual({
      status: 'skipped',
      reason: 'source_budget',
    })
    expect(await makeSession().contents(['http://localhost/private'])).toEqual({
      status: 'error',
      reason: 'invalid_source_url',
    })
    expect(await makeSession().search('nice', ['evil.example'])).toEqual({
      status: 'error',
      reason: 'invalid_search',
    })
    expect(
      await createExaSession({ allowedDomains: [domain], apiKey, budgetClient: null }).contents([
        url,
      ])
    ).toEqual({ status: 'skipped', reason: 'budget_unavailable' })
    reserveStatus = 'exhausted'
    expect(await makeSession().contents([url])).toEqual({
      status: 'skipped',
      reason: 'budget_exhausted',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('redirects never forward the key and uncertain failures retain the debit', async () => {
    spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = mock(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://www.etymonline.com/steal' },
        })
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
    expect(await makeSession().contents([url])).toEqual({
      status: 'error',
      reason: 'request_failed',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(transactions[1].slice(1)).toEqual(['commit', ''])
    globalThis.fetch = mock(
      async () => new Response('<html>blocked</html>', { status: 403 })
    ) as unknown as typeof fetch
    expect(await makeSession().contents([url])).toEqual({
      status: 'error',
      reason: 'http_error',
      httpStatus: 403,
    })
  })

  test('concurrent source exhaustion releases only the unsent reservation', async () => {
    globalThis.fetch = mock(async () => Response.json({ results: [] })) as unknown as typeof fetch
    const results = await Promise.all([makeSession(new SourceFetchBudget(0)).contents([url])])
    expect(results[0]).toEqual({ status: 'skipped', reason: 'source_budget' })
    const budget = new SourceFetchBudget(1)
    const session = makeSession(budget)
    const raced = await Promise.all([session.contents([url]), session.contents([url])])
    expect(raced.map((result) => result.status)).toEqual(['success', 'skipped'])
    expect(transactions.filter((args) => args[1] === 'release')).toHaveLength(1)
    expect(budget.attempts).toBe(1)
  })

  test('caller cancellation during body reading propagates after retaining the debit', async () => {
    const controller = new AbortController()
    globalThis.fetch = mock(async () => {
      const response = Response.json({ results: [] })
      response.json = async () => {
        controller.abort()
        throw controller.signal.reason
      }
      return response
    }) as unknown as typeof fetch
    const session = createExaSession({
      allowedDomains: [domain],
      apiKey,
      budgetClient: client,
      signal: controller.signal,
      sourceBudget: new SourceFetchBudget(32),
    })
    await expect(session.contents([url])).rejects.toThrow()
    expect(transactions[1].slice(1)).toEqual(['commit', ''])
  })

  test('redacts configured Exa secrets', () => {
    const previous = process.env.EXA_API_KEY
    process.env.EXA_API_KEY = apiKey
    try {
      expect(safeError(new Error(`Provider rejected ${apiKey}`))).toBe(
        'Provider rejected [REDACTED]'
      )
    } finally {
      if (previous === undefined) delete process.env.EXA_API_KEY
      else process.env.EXA_API_KEY = previous
    }
  })
})
