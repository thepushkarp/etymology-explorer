import { afterEach, describe, expect, test } from 'bun:test'
import { fetchWithTimeout } from '@/lib/fetchUtils'
import { SourceFetchBudget } from '@/lib/sourceFetchBudget'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('source redirect boundary', () => {
  const source = 'https://en.wiktionary.org/w/api.php?page=word'

  test.each([
    'http://en.wiktionary.org/w/api.php',
    'https://localhost/private',
    'https://127.0.0.1/private',
    'https://[::1]/private',
    'https://169.254.169.254/latest/meta-data/',
    'https://en.wiktionary.org.attacker.example/private',
    'https://attacker.example/en.wiktionary.org',
    'https://en.wiktionary.org:8443/private',
    'https://user:password@en.wiktionary.org/private',
    'file:///etc/passwd',
  ])('rejects an unapproved redirect before fetching %s', async (location) => {
    const calls: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(String(input))
      return new Response(null, { status: 302, headers: { location } })
    }) as unknown as typeof fetch
    const budget = new SourceFetchBudget(16)
    await expect(budget.run(() => fetchWithTimeout(source, {}, 100))).rejects.toThrow(
      'Unapproved source request URL'
    )
    expect(calls).toEqual([source])
    expect(budget.attempts).toBe(1)
  })

  test('rejects an unapproved initial source without consuming a slot', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response('ok')
    }) as unknown as typeof fetch
    const budget = new SourceFetchBudget(16)
    await expect(
      budget.run(() => fetchWithTimeout('https://attacker.example', {}, 100))
    ).rejects.toThrow('Unapproved source request URL')
    expect(calls).toBe(0)
    expect(budget.attempts).toBe(0)
  })

  test('follows relative and approved cross-origin redirects and strips credentials', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      if (calls.length === 1)
        return new Response(null, { status: 302, headers: { location: '/next' } })
      if (calls.length === 2)
        return new Response(null, {
          status: 307,
          headers: { location: 'https://fr.wiktionary.org/w/api.php' },
        })
      return new Response('ok')
    }) as unknown as typeof fetch
    const budget = new SourceFetchBudget(16)
    const response = await budget.run(() =>
      fetchWithTimeout(
        source,
        {
          headers: {
            Authorization: 'Bearer test',
            Cookie: 'session=test',
            'Proxy-Authorization': 'test',
            'User-Agent': 'EtymologyExplorer',
          },
        },
        100
      )
    )
    expect(await response.text()).toBe('ok')
    expect(calls.map((call) => call.url)).toEqual([
      source,
      'https://en.wiktionary.org/next',
      'https://fr.wiktionary.org/w/api.php',
    ])
    expect(calls.every((call) => call.init?.redirect === 'manual')).toBe(true)
    expect(new Headers(calls[1].init?.headers).get('authorization')).toBe('Bearer test')
    const finalHeaders = new Headers(calls[2].init?.headers)
    expect(finalHeaders.get('authorization')).toBeNull()
    expect(finalHeaders.get('cookie')).toBeNull()
    expect(finalHeaders.get('proxy-authorization')).toBeNull()
    expect(finalHeaders.get('user-agent')).toBe('EtymologyExplorer')
    expect(budget.attempts).toBe(3)
  })

  test('explicit follow mode cannot bypass the source budget', async () => {
    let calls = 0
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      calls++
      expect(init?.redirect).toBe('manual')
      return new Response(null, { status: 302, headers: { location: '/next' } })
    }) as unknown as typeof fetch
    const budget = new SourceFetchBudget(2)
    await expect(
      budget.run(() => fetchWithTimeout(source, { redirect: 'follow' }, 100))
    ).rejects.toThrow('budget exhausted')
    expect(calls).toBe(2)
    expect(budget.attempts).toBe(2)
  })

  test.each(['manual', 'error'] as const)('honors redirect mode %s', async (redirect) => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response(null, { status: 302, headers: { location: '/next' } })
    }) as unknown as typeof fetch
    const budget = new SourceFetchBudget(16)
    const pending = budget.run(() => fetchWithTimeout(source, { redirect }, 100))
    if (redirect === 'manual') expect((await pending).status).toBe(302)
    else await expect(pending).rejects.toThrow('Source redirect disallowed')
    expect(calls).toBe(1)
  })

  test.each([
    [301, 'POST', 'GET'],
    [302, 'POST', 'GET'],
    [303, 'PUT', 'GET'],
    [303, 'HEAD', 'HEAD'],
    [307, 'POST', 'POST'],
    [308, 'POST', 'POST'],
  ])('redirect %i changes %s to %s', async (status, method, expectedMethod) => {
    const calls: RequestInit[] = []
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {})
      return calls.length === 1
        ? new Response(null, { status, headers: { location: '/next' } })
        : new Response('ok')
    }) as unknown as typeof fetch
    const budget = new SourceFetchBudget(16)
    const body = method === 'HEAD' ? undefined : 'payload'
    await budget.run(() =>
      fetchWithTimeout(source, { method, body, headers: { 'Content-Type': 'text/plain' } }, 100)
    )
    expect(calls[1].method).toBe(expectedMethod)
    expect(calls[1].body).toBe(expectedMethod === 'GET' ? undefined : body)
    expect(new Headers(calls[1].headers).get('content-type')).toBe(
      expectedMethod === 'GET' ? null : 'text/plain'
    )
  })

  test('caller cancellation between hops prevents the next request', async () => {
    const controller = new AbortController()
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      controller.abort()
      return new Response(null, { status: 302, headers: { location: '/next' } })
    }) as unknown as typeof fetch
    const budget = new SourceFetchBudget(16)
    await expect(
      budget.run(() => fetchWithTimeout(source, {}, 100, controller.signal))
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls).toBe(1)
    expect(budget.attempts).toBe(1)
  })
})

describe('app-wide destination boundary', () => {
  test.each([
    'https://openrouter.ai/api/v1/responses',
    'https://api.elevenlabs.io/v1/text-to-speech/voice?output_format=mp3_44100_128',
    'https://books.google.com/ngrams/json?content=caf%C3%A9',
    'https://fr.wiktionary.org/w/api.php?action=opensearch&search=caf%C3%A9',
  ])('retains approved endpoint path and query outside source scope: %s', async (url) => {
    const calls: string[] = []
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push(String(input))
      expect(init?.redirect).toBe('manual')
      return new Response('ok')
    }) as unknown as typeof fetch
    expect((await fetchWithTimeout(url, {}, 100)).ok).toBe(true)
    expect(calls).toEqual([url])
  })

  test('rejects unapproved initial and redirect targets without a source budget', async () => {
    const calls: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(String(input))
      return new Response(null, {
        status: 302,
        headers: { location: 'https://169.254.169.254/latest/meta-data/' },
      })
    }) as unknown as typeof fetch
    await expect(fetchWithTimeout('https://attacker.example', {}, 100)).rejects.toThrow(
      'Unapproved request URL'
    )
    expect(calls).toHaveLength(0)
    await expect(fetchWithTimeout('https://books.google.com/ngrams/json', {}, 100)).rejects.toThrow(
      'Unapproved request URL'
    )
    expect(calls).toEqual(['https://books.google.com/ngrams/json'])
  })

  test('source scope cannot redirect to a paid provider', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response(null, {
        status: 307,
        headers: { location: 'https://openrouter.ai/api/v1/responses' },
      })
    }) as unknown as typeof fetch
    const budget = new SourceFetchBudget(16)
    await expect(
      budget.run(() => fetchWithTimeout('https://en.wiktionary.org/w/api.php', {}, 100))
    ).rejects.toThrow('Unapproved source request URL')
    expect(calls).toBe(1)
    expect(budget.attempts).toBe(1)
  })

  test('strips ElevenLabs credentials only when crossing an approved origin', async () => {
    const calls: RequestInit[] = []
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {})
      if (calls.length === 1)
        return new Response(null, { status: 307, headers: { location: '/v1/next' } })
      if (calls.length === 2)
        return new Response(null, {
          status: 307,
          headers: { location: 'https://openrouter.ai/api/v1/responses' },
        })
      return new Response('ok')
    }) as unknown as typeof fetch
    await fetchWithTimeout(
      'https://api.elevenlabs.io/v1/text-to-speech/voice',
      { method: 'POST', body: '{"text":"word"}', headers: { 'xi-api-key': 'test-key' } },
      100
    )
    expect(new Headers(calls[1].headers).get('xi-api-key')).toBe('test-key')
    expect(new Headers(calls[2].headers).get('xi-api-key')).toBeNull()
    expect(calls[2].body).toBe('{"text":"word"}')
    expect(calls[2].method).toBe('POST')
  })

  test('caps unscoped redirect loops', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response(null, { status: 302, headers: { location: '/next' } })
    }) as unknown as typeof fetch
    await expect(fetchWithTimeout('https://books.google.com/ngrams/json', {}, 100)).rejects.toThrow(
      'Too many source redirects'
    )
    expect(calls).toBe(6)
  })

  test.each([303, 307])(
    'preserves Request POST metadata and handles redirect %i',
    async (status) => {
      const calls: Array<{ method: string; body: string; headers: Headers }> = []
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(input, init)
        calls.push({ method: request.method, body: await request.text(), headers: request.headers })
        return calls.length === 1
          ? new Response(null, { status, headers: { location: '/next' } })
          : new Response('ok')
      }) as unknown as typeof fetch
      const request = new Request('https://openrouter.ai/api/v1/responses', {
        method: 'POST',
        body: 'payload',
        headers: { 'Content-Type': 'text/plain', Authorization: 'test' },
      })
      const pending = fetchWithTimeout(request, {}, 100)
      if (status === 307)
        await expect(pending).rejects.toThrow('Cannot replay streamed request body')
      else {
        await pending
        expect(calls[1].method).toBe('GET')
        expect(calls[1].body).toBe('')
        expect(calls[1].headers.get('content-type')).toBeNull()
      }
      expect(calls[0].method).toBe('POST')
      expect(calls[0].body).toBe('payload')
      expect(calls[0].headers.get('authorization')).toBe('test')
    }
  )
})

/** A fetch that never resolves unless its (composed) signal aborts. */
function installHangingFetch(): void {
  globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException('The operation was aborted', 'AbortError'))
      if (init?.signal?.aborted) {
        abort()
        return
      }
      init?.signal?.addEventListener('abort', abort)
    })) as typeof fetch
}

describe('fetchWithTimeout signal composition', () => {
  test('timeout aborts convert to a descriptive timeout error', async () => {
    installHangingFetch()

    expect(fetchWithTimeout('https://en.wiktionary.org', {}, 30)).rejects.toThrow(
      'Request timeout after 30ms'
    )
  })

  test('caller abort propagates as an AbortError, not a timeout', async () => {
    installHangingFetch()
    const controller = new AbortController()

    const pending = fetchWithTimeout('https://en.wiktionary.org', {}, 60_000, controller.signal)
    setTimeout(() => controller.abort(), 10)

    expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await pending.catch(() => {})
  })

  test('an already-aborted caller signal rejects immediately', async () => {
    installHangingFetch()
    const controller = new AbortController()
    controller.abort()

    const startedAt = Date.now()
    await fetchWithTimeout('https://en.wiktionary.org', {}, 60_000, controller.signal).catch(
      (error: unknown) => {
        expect((error as DOMException).name).toBe('AbortError')
      }
    )
    expect(Date.now() - startedAt).toBeLessThan(1000)
  })
})
