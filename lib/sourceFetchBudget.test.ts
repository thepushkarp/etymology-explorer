import { afterEach, expect, test } from 'bun:test'
import { SourceFetchBudget } from './sourceFetchBudget'
import { fetchWithTimeout } from './fetchUtils'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

test('concurrent failed attempts reserve atomically and never exceed the ceiling', async () => {
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    throw new Error('offline')
  }) as unknown as typeof fetch
  const budget = new SourceFetchBudget(16)
  await Promise.allSettled(
    Array.from({ length: 40 }, () =>
      budget.run(() => fetchWithTimeout('https://en.wiktionary.org', {}, 100))
    )
  )
  expect(calls).toBe(16)
  expect(budget.attempts).toBe(16)
  expect(budget.exhausted).toBe(true)
})

test('each HTTP redirect consumes a request and exhaustion prevents its target', async () => {
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return new Response(null, { status: 302, headers: { location: '/next' } })
  }) as unknown as typeof fetch
  const budget = new SourceFetchBudget(2)
  await expect(
    budget.run(() => fetchWithTimeout('https://en.wiktionary.org', {}, 100))
  ).rejects.toThrow('budget exhausted')
  expect(calls).toBe(2)
})

test('cache-only work and pre-aborted calls use zero slots; outside scope is unaffected', async () => {
  globalThis.fetch = (async () => new Response('ok')) as unknown as typeof fetch
  const budget = new SourceFetchBudget(0)
  expect(await budget.run(async () => 'cached')).toBe('cached')
  await expect(
    budget.run(() => fetchWithTimeout('https://en.wiktionary.org', {}, 100, AbortSignal.abort()))
  ).rejects.toThrow()
  expect(budget.attempts).toBe(0)
  expect((await fetchWithTimeout('https://en.wiktionary.org', {}, 100)).ok).toBe(true)
})

test('records actual HTTP 429 responses without adding retries', async () => {
  globalThis.fetch = (async () =>
    new Response('rate limited', { status: 429 })) as unknown as typeof fetch
  const budget = new SourceFetchBudget(16)
  const response = await budget.run(() => fetchWithTimeout('https://en.wiktionary.org', {}, 100))
  expect(response.status).toBe(429)
  expect(budget.rateLimited).toBe(true)
  expect(budget.attempts).toBe(1)
})
