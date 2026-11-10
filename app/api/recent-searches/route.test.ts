import { expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

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
