import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { GET } from './route'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('/api/suggestions', () => {
  test('an omitted language is Auto and can suggest non-Latin spellings', async () => {
    const requests: URL[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      requests.push(new URL(input instanceof Request ? input.url : String(input)))
      return Response.json(['', ['津波']])
    }) as unknown as typeof fetch
    const response = await GET(new NextRequest('http://localhost/api/suggestions?q=津波'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: { suggestions: [{ word: '津波', distance: 0 }] },
    })
    expect(requests.map((url) => url.hostname)).toEqual(['en.wiktionary.org'])
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('provider outage results cannot be cached by browsers or CDNs', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {})
    try {
      globalThis.fetch = (async () => new Response('', { status: 503 })) as unknown as typeof fetch
      const unavailable = await GET(new NextRequest('http://localhost/api/suggestions?q=津波'))
      expect(await unavailable.json()).toEqual({ success: true, data: { suggestions: [] } })
      expect(unavailable.headers.get('cache-control')).toBe('no-store')

      globalThis.fetch = (async () => Response.json(['', ['津波']])) as unknown as typeof fetch
      const recovered = await GET(new NextRequest('http://localhost/api/suggestions?q=津波'))
      expect(await recovered.json()).toEqual({
        success: true,
        data: { suggestions: [{ word: '津波', distance: 0 }] },
      })
    } finally {
      errors.mockRestore()
    }
  })

  test('rejects unsupported languages and invalid or missing queries before fetching', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      throw new Error('unexpected provider request')
    }) as unknown as typeof fetch
    for (const query of ['?q=chat&language=invalid', '', '?q=%3Cinvalid%3E']) {
      expect((await GET(new NextRequest(`http://localhost/api/suggestions${query}`))).status).toBe(
        400
      )
    }
    expect(calls).toBe(0)
  })

  test('one-character queries return no suggestions without fetching', async () => {
    globalThis.fetch = (async () => {
      throw new Error('unexpected provider request')
    }) as unknown as typeof fetch
    const response = await GET(new NextRequest('http://localhost/api/suggestions?q=a'))
    expect(await response.json()).toEqual({ success: true, data: { suggestions: [] } })
  })
})
