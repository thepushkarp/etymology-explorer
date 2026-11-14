import { afterEach, expect, spyOn, test } from 'bun:test'
import * as cache from './cache'
import { getLookupGroup } from './lookupGroupCache'
import { lookupGroupForWord } from './lookupGroups'
import { entryNavigation } from './entryNavigation'
import { traceLookupAlternatives } from './traceLookupAlternatives'
import { etymologyResult } from './testSupport/etymologyResult'
import type { WordEntry } from './types'

const originalFetch = globalThis.fetch
const restore: Array<() => void> = []
afterEach(() => {
  globalThis.fetch = originalFetch
  restore
    .splice(0)
    .reverse()
    .forEach((fn) => fn())
})

test('a traced alias appears as one canonical choice and remains reloadable from either form', async () => {
  const english: WordEntry = {
    word: 'tsunami',
    languages: ['en'],
    entries: { en: etymologyResult({ word: 'tsunami' }) },
    otherScripts: [{ word: 'つなみ', language: 'ja' }],
    otherLanguages: [],
    revision: 1,
    tracedAt: new Date().toISOString(),
  }
  const result = etymologyResult({ word: '津波', language: 'ja', definition: 'A wave.' })
  result.histories[0].transliteration = 'tsunami'
  const canonical: WordEntry = {
    ...english,
    word: '津波',
    languages: ['ja'],
    entries: { ja: result },
    otherScripts: [],
  }
  const entries = new Map<string, WordEntry>([['tsunami', english]])
  let traced = false
  let traces = 0
  const reads = spyOn(cache, 'getCachedEntry').mockImplementation(async (word) => {
    const entry = entries.get(word)
    return entry ? { entry, stale: false } : null
  })
  const aliases = spyOn(cache, 'getCachedSpellingEntry').mockImplementation(
    async (word, language) =>
      traced && word === 'つなみ' && language === 'ja'
        ? { entry: canonical, word: '津波', language: 'ja', stale: false }
        : null
  )
  restore.push(
    () => reads.mockRestore(),
    () => aliases.mockRestore()
  )
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/lookup-group')
      return Response.json({ group: await getLookupGroup(url.searchParams.get('word')!) })
    expect(url.pathname).toBe('/api/etymology')
    expect(url.searchParams.get('word')).toBe('つなみ')
    traced = true
    traces++
    entries.set(canonical.word, canonical)
    return Response.json({ success: true, data: canonical })
  }) as typeof fetch
  expect(
    await traceLookupAlternatives('tsunami', english, new AbortController().signal, () => {})
  ).toBeUndefined()
  const group = (await getLookupGroup('tsunami'))!
  expect(group.choices.map((choice) => choice.word)).toEqual(['津波'])
  expect(lookupGroupForWord('つなみ', group)).toBe(group)
  expect(lookupGroupForWord('津波', group)).toBe(group)
  expect(
    entryNavigation({ word: 'tsunami', language: 'en', entry: english, group }).tabs.map(
      (tab) => tab.language
    )
  ).toEqual(['en', 'ja'])
  english.otherScripts!.push({ word: '津波', language: 'ja' })
  expect((await getLookupGroup('tsunami'))!.choices).toHaveLength(1)
  await traceLookupAlternatives('tsunami', english, new AbortController().signal, () => {})
  expect(traces).toBe(1)
  traced = false
  english.otherScripts!.pop()
  expect((await getLookupGroup('tsunami'))!.choices).toEqual([])
})
