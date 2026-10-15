import { currentSourceFetchBudget } from './sourceFetchBudget'

// Exact origins, rather than domain suffixes, keep source redirects away from
// private services, lookalike hosts, alternate ports, and unapproved editions.
const SOURCE_ORIGINS = [
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
  'https://freedictionaryapi.com',
  'https://api.dicionario-aberto.net',
  'https://incels.wiki',
] as const

const APP_ORIGINS = [
  ...SOURCE_ORIGINS,
  'https://openrouter.ai',
  'https://api.elevenlabs.io',
  'https://books.google.com',
] as const

function trustedRequestUrl(target: string | URL | Request, sourceOnly: boolean): URL {
  const parsed = new URL(target instanceof Request ? target.url : String(target))
  const origin = (sourceOnly ? SOURCE_ORIGINS : APP_ORIGINS).find(
    (trusted) => trusted === parsed.origin
  )
  if (!origin || parsed.username || parsed.password) {
    throw new Error(sourceOnly ? 'Unapproved source request URL' : 'Unapproved request URL')
  }
  // Construct the authority from a matched server-owned literal. Only path and
  // query are copied from the incoming URL; neither can change the destination.
  const trusted = new URL(origin)
  trusted.pathname = parsed.pathname
  trusted.search = parsed.search
  return trusted
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
    // All redirects cross the same destination boundary. Source HTTP hops also
    // consume the research budget, while LLM/TTS/ngram calls remain separate.
    let target = trustedRequestUrl(url, Boolean(budget))
    const request = url instanceof Request ? new Request(url, options) : undefined
    let init: RequestInit = request
      ? {
          ...options,
          method: request.method,
          headers: request.headers,
          body: request.body,
          cache: request.cache,
          credentials: request.credentials,
          integrity: request.integrity,
          keepalive: request.keepalive,
          mode: request.mode,
          referrer: request.referrer,
          referrerPolicy: request.referrerPolicy,
          ...(request.body ? { duplex: 'half' } : {}),
        }
      : options
    const redirect = options.redirect ?? (url instanceof Request ? url.redirect : 'follow')
    for (let hop = 0; ; hop++) {
      composedSignal.throwIfAborted()
      budget?.reserve()
      const response = await fetch(target, {
        ...init,
        redirect: 'manual',
        signal: composedSignal,
      })
      if (budget && response.status === 429) budget.rateLimited = true
      if (redirect === 'manual' || ![301, 302, 303, 307, 308].includes(response.status)) {
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
      const next = trustedRequestUrl(new URL(location, target), Boolean(budget))
      const headers = new Headers(init.headers)
      const method = (init.method ?? 'GET').toUpperCase()
      if (target.origin !== next.origin) {
        headers.delete('authorization')
        headers.delete('cookie')
        headers.delete('proxy-authorization')
        headers.delete('xi-api-key')
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
        // Like native Fetch, a streamed upload cannot be replayed on a
        // body-preserving redirect. App JSON POST bodies remain replayable.
        if (init.body instanceof ReadableStream) {
          throw new Error('Cannot replay streamed request body after redirect')
        }
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
