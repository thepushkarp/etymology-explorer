import { currentSourceFetchBudget } from './sourceFetchBudget'

/**
 * Fetch wrapper with AbortController-based timeout.
 * Prevents external sources from hanging requests indefinitely.
 * An optional caller signal (e.g. request.signal from a disconnected
 * client) is composed with the timeout via AbortSignal.any so either
 * one cancels the underlying request.
 */

export async function fetchWithTimeout(
  url: string | URL | Request,
  options: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const composedSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal

  try {
    composedSignal.throwIfAborted()
    const budget = currentSourceFetchBudget()
    // Source redirects are followed explicitly so each HTTP hop consumes a slot.
    let target = url
    let init = options
    for (let hop = 0; ; hop++) {
      composedSignal.throwIfAborted()
      budget?.reserve()
      const response = await fetch(target, {
        ...init,
        ...(budget && !options.redirect ? { redirect: 'manual' } : {}),
        signal: composedSignal,
      })
      if (budget && response.status === 429) budget.rateLimited = true
      if (!budget || options.redirect || ![301, 302, 303, 307, 308].includes(response.status)) {
        return response
      }
      const location = response.headers.get('location')
      if (!location) return response
      await response.body?.cancel()
      if (hop >= 5) throw new Error('Too many source redirects')
      const base = target instanceof Request ? target.url : String(target)
      const next = new URL(location, base)
      if (next.protocol !== 'https:' && next.protocol !== 'http:') {
        throw new Error('Invalid source redirect protocol')
      }
      const headers = new Headers(init.headers)
      if (new URL(base).origin !== next.origin) {
        headers.delete('authorization')
        headers.delete('cookie')
      }
      if (
        response.status === 303 ||
        ([301, 302].includes(response.status) && init.method === 'POST')
      ) {
        init = { ...init, method: 'GET', body: undefined, headers }
      } else {
        init = { ...init, headers }
      }
      target = next
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      // Caller-initiated cancellation propagates as-is; only convert
      // our own timeout abort into a descriptive timeout error.
      if (signal?.aborted) {
        throw error
      }
      throw new Error(`Request timeout after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
