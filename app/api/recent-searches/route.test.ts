import { expect, spyOn, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import * as entryCache from '@/lib/cache'
import * as recentSearches from '@/lib/recentSearches'
import { etymologyResult } from '@/lib/testSupport/etymologyResult'

test('navigation through a verified spelling records the canonical entry', async () => {
  const result = etymologyResult({ word: '津波', language: 'ja' })
  const lookup = spyOn(entryCache, 'getCachedSpellingEntry').mockResolvedValue({
    word: result.word,
    language: 'ja',
    stale: false,
    entry: {
      word: result.word,
      languages: ['ja'],
      entries: { ja: result },
      otherLanguages: [],
      tracedAt: new Date().toISOString(),
      revision: 1,
    },
  })
  const record = spyOn(recentSearches, 'recordRecentSearch').mockResolvedValue(true)
  try {
    const response = await POST(
      new NextRequest('http://localhost/api/recent-searches', {
        method: 'POST',
        body: JSON.stringify({ word: 'つなみ' }),
      })
    )
    expect(response.status).toBe(200)
    expect(lookup).toHaveBeenCalledWith('つなみ')
    expect(record).toHaveBeenCalledWith('津波')
  } finally {
    lookup.mockRestore()
    record.mockRestore()
  }
})

test('rejects unsupported language filters without loading recent searches', async () => {
  const response = await GET(new NextRequest('http://localhost/api/recent-searches?language=de'))
  expect(response.status).toBe(400)
  expect(response.headers.get('cache-control')).toBe('no-store')
})

test('rejects malformed searches and client-provided teaser content', async () => {
  for (const body of [
    'not json',
    JSON.stringify({ word: 'nice', language: 'de' }),
    JSON.stringify({ word: 'nice', language: 4 }),
    JSON.stringify({ word: 'bad\ninput', language: 'en' }),
    JSON.stringify({ word: 'nice', language: 'en', teaser: 'Untrusted prose.' }),
  ]) {
    const response = await POST(
      new NextRequest('http://localhost/api/recent-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    )
    expect(response.status).toBe(400)
  }
})
