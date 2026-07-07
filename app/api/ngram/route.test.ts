import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/ngram/route'

function ngramRequest(word?: string): NextRequest {
  const url = new URL('http://localhost:3000/api/ngram')
  if (word !== undefined) {
    url.searchParams.set('word', word)
  }
  return new NextRequest(url)
}

describe('/api/ngram input validation', () => {
  test('rejects a missing word parameter', async () => {
    const response = await GET(ngramRequest())

    expect(response.status).toBe(400)
  })

  test('rejects whitespace-only input', async () => {
    const response = await GET(ngramRequest('   '))

    expect(response.status).toBe(400)
  })

  test('rejects words with digits', async () => {
    const response = await GET(ngramRequest('abc123'))

    expect(response.status).toBe(400)
  })

  test('rejects words with shell/URL metacharacters', async () => {
    for (const word of ['tele;phone', 'word?', 'a&b', 'hello!']) {
      const response = await GET(ngramRequest(word))
      expect(response.status).toBe(400)
    }
  })

  test('rejects words longer than the max length', async () => {
    const response = await GET(ngramRequest('a'.repeat(36)))

    expect(response.status).toBe(400)
  })
})
