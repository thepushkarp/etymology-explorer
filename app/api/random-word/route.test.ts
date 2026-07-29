import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/random-word/route'
import { SUPPORTED_LANGUAGE_CODES, type LanguageCode } from '@/lib/languages'
import { getRandomWordPool } from '@/lib/wordlist'

function randomWordRequest(language?: string): NextRequest {
  const url = new URL('http://localhost:3000/api/random-word')
  if (language !== undefined) {
    url.searchParams.set('language', language)
  }
  return new NextRequest(url)
}

describe('/api/random-word language selection', () => {
  test('defaults an omitted language to English', async () => {
    const response = await GET(randomWordRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(getRandomWordPool('en')).toContain(payload.data.word)
  })

  test('returns a word only from the explicitly selected language pool', async () => {
    for (const language of SUPPORTED_LANGUAGE_CODES) {
      const response = await GET(randomWordRequest(language))
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(getRandomWordPool(language as LanguageCode)).toContain(payload.data.word)
    }
  })

  test('rejects unsupported language tags', async () => {
    const response = await GET(randomWordRequest('de'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ success: false, error: 'Unsupported language' })
  })
})
