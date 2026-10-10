import { currentSourceFetchBudget } from './sourceFetchBudget'

// Exact origins, rather than domain suffixes, keep source redirects away from
// private services, lookalike hosts, alternate ports, and unapproved editions.
const SOURCE_ORIGINS = new Set([
  'https://www.etymonline.com',
  'https://etymonline.com',
  'https://en.wiktionary.org',
  'https://it.wiktionary.org',
  'https://es.wiktionary.org',
  'https://fr.wiktionary.org',
  'https://pt.wiktionary.org',
  'https://en.wikipedia.org',
  'https://it.wikipedia.org',
  'https://es.wikipedia.org',
  'https://fr.wikipedia.org',
  'https://pt.wikipedia.org',
  'https://www.wikidata.org',
  'https://api.dictionaryapi.dev',
  'https://freedictionaryapi.com',
  'https://api.dicionario-aberto.net',
  'https://api.urbandictionary.com',
  'https://incels.wiki',
])

function validateSourceTarget(target: string | URL | Request): URL {
  const parsed = new URL(target instanceof Request ? target.url : String(target))
  if (!SOURCE_ORIGINS.has(parsed.origin) || parsed.username || parsed.password) {
    throw new Error('Unapproved source request URL')
  }
  return parsed
}

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
    const redirect = options.redirect ?? (url instanceof Request ? url.redirect : 'follow')
    for (let hop = 0; ; hop++) {
      composedSignal.throwIfAborted()
      if (budget) validateSourceTarget(target)
      budget?.reserve()
      const response = await fetch(target, {
        ...init,
        ...(budget ? { redirect: 'manual' } : {}),
        signal: composedSignal,
      })
      if (budget && response.status === 429) budget.rateLimited = true
      if (
        !budget ||
        redirect === 'manual' ||
        ![301, 302, 303, 307, 308].includes(response.status)
      ) {
        return response
      }
      if (redirect === 'error') {
        await response.body?.cancel()
        throw new Error('Source redirect disallowed')
      }
      const location = response.headers.get('location')
      if (!location) return response
      await response.body?.cancel()
      if (hop >= 5) throw new Error('Too many source redirects')
      const base = target instanceof Request ? target.url : String(target)
      const next = new URL(location, base)
      validateSourceTarget(next)
      const headers = new Headers(
        init.headers ?? (target instanceof Request ? target.headers : undefined)
      )
      const method = (
        init.method ?? (target instanceof Request ? target.method : 'GET')
      ).toUpperCase()
      if (new URL(base).origin !== next.origin) {
        headers.delete('authorization')
        headers.delete('cookie')
        headers.delete('proxy-authorization')
      }
      if (
        (response.status === 303 && method !== 'GET' && method !== 'HEAD') ||
        ([301, 302].includes(response.status) && method === 'POST')
      ) {
        for (const name of [
          'content-encoding',
          'content-language',
          'content-location',
          'content-type',
          'content-length',
        ]) {
          headers.delete(name)
        }
        init = { ...init, method: 'GET', body: undefined, headers }
      } else {
        init = { ...init, method, headers }
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
