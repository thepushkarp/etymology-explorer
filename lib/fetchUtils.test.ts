import { afterEach, describe, expect, test } from 'bun:test'
import { fetchWithTimeout } from '@/lib/fetchUtils'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
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

    expect(fetchWithTimeout('https://example.com', {}, 30)).rejects.toThrow(
      'Request timeout after 30ms'
    )
  })

  test('caller abort propagates as an AbortError, not a timeout', async () => {
    installHangingFetch()
    const controller = new AbortController()

    const pending = fetchWithTimeout('https://example.com', {}, 60_000, controller.signal)
    setTimeout(() => controller.abort(), 10)

    expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await pending.catch(() => {})
  })

  test('an already-aborted caller signal rejects immediately', async () => {
    installHangingFetch()
    const controller = new AbortController()
    controller.abort()

    const startedAt = Date.now()
    await fetchWithTimeout('https://example.com', {}, 60_000, controller.signal).catch(
      (error: unknown) => {
        expect((error as DOMException).name).toBe('AbortError')
      }
    )
    expect(Date.now() - startedAt).toBeLessThan(1000)
  })
})
