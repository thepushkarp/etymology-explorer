import { afterEach, expect, test } from 'bun:test'
import { traceLookupAlternatives } from './traceLookupAlternatives'
import { etymologyResult } from './testSupport/etymologyResult'
import type { LookupGroup, WordEntry } from './types'

const originalFetch = globalThis.fetch
const result = etymologyResult({ word: 'shiro', language: 'en' })
const entry: WordEntry = {
  word: 'shiro',
  entries: { en: result },
  languages: ['en'],
  otherLanguages: [],
  revision: 1,
  tracedAt: '2026-11-13T00:00:00Z',
  otherScripts: [{ word: 'しろ', language: 'ja' }],
}
function group(words: string[], ready: string[] = []): LookupGroup {
  return {
    reading: 'しろ',
    members: words.map((word) => ({
      word,
      language: 'ja',
      lookupSupport: ready.includes(word) ? 'verified' : 'linked',
    })),
    choices: ready.map((word) => ({ word, language: 'ja', historyId: word, label: word })),
    languages: [{ word: 'shiro', language: 'en' }],
  }
}
afterEach(() => {
  globalThis.fetch = originalFetch
})

test('checks every source-linked candidate beyond four, reuses ready meanings and publishes only server metadata', async () => {
  const requests: string[] = []
  let metadata = group(['しろ'])
  const published: LookupGroup[] = []
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    expect(init?.signal).toBeDefined()
    if (url.pathname === '/api/lookup-group') return Response.json({ group: metadata })
    const word = url.searchParams.get('word')!
    requests.push(word)
    expect(url.searchParams.get('language')).toBe('ja')
    expect(url.searchParams.has('refresh')).toBe(false)
    metadata = group(['しろ', '白', '城', '代', '余', '別'], ['しろ', '白'])
    return word === 'しろ'
      ? Response.json({ success: true, data: { entries: { ja: {} } } })
      : Response.json({ success: false, errorType: 'nonsense' }, { status: 404 })
  }) as typeof fetch
  await traceLookupAlternatives('shiro', entry, new AbortController().signal, (g) => {
    if (g) published.push(g)
  })
  expect(requests).toEqual(['しろ', '城', '代', '余', '別'])
  expect(published.at(-1)?.choices.map((c) => c.word)).toEqual(['しろ', '白'])
})

test('temporary failure stays retryable and a budget limit stops remaining work', async () => {
  let attempts = 0
  globalThis.fetch = (async (input) => {
    if (String(input).includes('/api/lookup-group'))
      return Response.json({ group: group(['城', '代']) })
    attempts++
    return Response.json(
      { success: false, error: 'Budget unavailable', errorType: 'budget' },
      { status: 503 }
    )
  }) as typeof fetch
  await expect(
    traceLookupAlternatives('shiro', entry, new AbortController().signal, () => {})
  ).resolves.toBe('Could not load related entry “城”: Budget unavailable')
  expect(attempts).toBe(1)
})

test('a timed-out alternative preserves loaded choices and can be retried explicitly', async () => {
  let metadata = group(['白', '城'], ['白'])
  let failed = true
  const requests: string[] = []
  const published: LookupGroup[] = []
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/lookup-group') return Response.json({ group: metadata })
    requests.push(url.searchParams.get('word')!)
    if (failed)
      return Response.json(
        {
          success: false,
          errorType: 'network',
          error: 'The etymology engine took too long to respond. Please try again.',
        },
        { status: 503 }
      )
    metadata = group(['白', '城'], ['白', '城'])
    return Response.json({ success: true, data: { entries: { ja: {} } } })
  }) as typeof fetch
  const publish = (value: LookupGroup | undefined) => {
    if (value) published.push(value)
  }
  const error = await traceLookupAlternatives('shiro', entry, new AbortController().signal, publish)
  expect(error).toContain('related entry “城”')
  expect(error).toContain('took too long')
  expect(published.at(-1)?.choices.map((choice) => choice.word)).toEqual(['白'])
  expect(requests).toEqual(['城'])
  failed = false
  expect(
    await traceLookupAlternatives('shiro', entry, new AbortController().signal, publish)
  ).toBeUndefined()
  expect(requests).toEqual(['城', '城'])
  expect(published.at(-1)?.choices.map((choice) => choice.word)).toEqual(['白', '城'])
})

test('cancellation prevents later candidates and metadata publication', async () => {
  const controller = new AbortController()
  let attempts = 0
  let publications = 0
  globalThis.fetch = (async (input) => {
    if (String(input).includes('/api/lookup-group'))
      return Response.json({ group: group(['城', '代']) })
    attempts++
    controller.abort()
    return Response.json({ success: true, data: { entries: { ja: {} } } })
  }) as typeof fetch
  await expect(
    traceLookupAlternatives('shiro', entry, controller.signal, () => {
      publications++
    })
  ).rejects.toThrow()
  expect(attempts).toBe(1)
  expect(publications).toBe(1)
})

test('a word without a saved lookup group cannot start alternative research', async () => {
  let requests = 0
  globalThis.fetch = (async (input) => {
    expect(String(input)).toContain('/api/lookup-group?')
    requests++
    return Response.json({ group: null })
  }) as typeof fetch
  await traceLookupAlternatives(
    '城',
    { ...entry, word: '城' },
    new AbortController().signal,
    () => {}
  )
  expect(requests).toBe(1)
})

test('evidence threshold excludes guesses regardless of position and keeps equal source links', async () => {
  const metadata = group(['推測', '城', '代'])
  metadata.members[0].lookupSupport = 'unverified'
  const requests: string[] = []
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/lookup-group') return Response.json({ group: metadata })
    requests.push(url.searchParams.get('word')!)
    return Response.json({ success: false }, { status: 404 })
  }) as typeof fetch
  await traceLookupAlternatives('shiro', entry, new AbortController().signal, () => {})
  expect(requests).toEqual(['城', '代'])
})

test('related research uses the destination language and does not merge identical spellings', async () => {
  const metadata: LookupGroup = {
    reading: 'pain',
    members: [
      { word: 'pain', language: 'en', lookupSupport: 'verified' },
      { word: 'pain', language: 'fr', lookupSupport: 'linked' },
    ],
    choices: [{ word: 'pain', language: 'en', label: 'English entry' }],
    languages: [],
  }
  let attempts = 0
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/lookup-group') return Response.json({ group: metadata })
    attempts++
    expect(url.searchParams.get('word')).toBe('pain')
    expect(url.searchParams.get('language')).toBe('fr')
    metadata.choices.push({ word: 'pain', language: 'fr', label: 'French entry' })
    return Response.json({ success: true, data: { entries: { fr: {} } } })
  }) as typeof fetch
  await expect(
    traceLookupAlternatives(
      'pain',
      { ...entry, word: 'pain' },
      new AbortController().signal,
      () => {}
    )
  ).resolves.toBeUndefined()
  expect(attempts).toBe(1)
})
