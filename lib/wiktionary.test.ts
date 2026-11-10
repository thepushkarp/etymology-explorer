import { afterEach, expect, test } from 'bun:test'
import { fetchSelectedWiktionaryLanguage } from './wiktionary'
import { SourceFetchBudget } from './sourceFetchBudget'
const original = globalThis.fetch
afterEach(() => {
  globalThis.fetch = original
})
const page = {
  parse: {
    title: 'porta',
    revid: 17,
    text: '<h2 id="Latin">Latin</h2><h3 id="Etymology">Etymology</h3><p>Attested Latin form. Final reference.</p>',
    tocdata: {
      sections: [
        { index: '1', line: 'Latin', anchor: 'Latin', hLevel: 2, number: '1' },
        { index: '2', line: 'Etymology', anchor: 'Etymology', hLevel: 3, number: '1.1' },
      ],
    },
  },
}
function serve(statuses: number[]) {
  let attempts = 0
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    if (process.env.KV_REST_API_URL && String(input).startsWith(process.env.KV_REST_API_URL)) {
      const body = JSON.parse(String(init?.body))
      return Response.json(
        Array.isArray(body[0]) ? body.map(() => ({ result: null })) : { result: null }
      )
    }
    const status = statuses[Math.min(attempts++, statuses.length - 1)]
    return status === 200 ? Response.json(page) : new Response('', { status })
  }) as typeof fetch
  return () => attempts
}
test('an ancestor retries one transient failure and retains complete provenance', async () => {
  const requests = serve([503, 200]),
    budget = new SourceFetchBudget(2)
  const data = await budget.run(() =>
    fetchSelectedWiktionaryLanguage('porta', 'Latin', undefined, { retryTransient: true })
  )
  expect(requests()).toBe(2)
  expect(budget.attempts).toBe(2)
  expect(data?.text).toContain('Final reference.')
  expect(data?.revisionId).toBe(17)
})
test.each([404, 429])('an ancestor does not retry HTTP %d', async (status) => {
  const requests = serve([status, 200]),
    budget = new SourceFetchBudget(3)
  const result = budget.run(() =>
    fetchSelectedWiktionaryLanguage('porta', 'Latin', undefined, { retryTransient: true })
  )
  if (status === 404) expect(await result).toBeNull()
  else await expect(result).rejects.toThrow('HTTP 429')
  expect(requests()).toBe(1)
})
test('ancestor recovery cannot exceed the shared HTTP budget', async () => {
  const requests = serve([503, 200]),
    budget = new SourceFetchBudget(1)
  await expect(
    budget.run(() =>
      fetchSelectedWiktionaryLanguage('porta', 'Latin', undefined, { retryTransient: true })
    )
  ).rejects.toThrow('Source HTTP request budget exhausted')
  expect(requests()).toBe(1)
  expect(budget.attempts).toBe(1)
})
