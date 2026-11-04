import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { fetchWithTimeout } from './fetchUtils'
import { getRedis } from './redis'
import {
  currentSourceFetchBudget,
  SourceFetchBudgetExceeded,
  type SourceFetchBudget,
} from './sourceFetchBudget'
import { reserveExaBudget, settleExaBudget, type ExaBudgetRedis } from './exaBudget'

export interface ExaDocument {
  url: string
  text: string
  title?: string
}

export interface ExaUrlStatus {
  id: string
  status: string
  source?: string
  error?: { tag?: string; httpStatusCode?: number }
}

export type ExaResponse =
  | {
      status: 'success'
      documents: ExaDocument[]
      statuses: ExaUrlStatus[]
      requestId?: string
      costUSD?: number
    }
  | {
      status: 'skipped' | 'error'
      reason: string
      httpStatus?: number
    }

export interface ExaSessionOptions {
  /** Server-owned source hosts, never domains taken from user input or search results. */
  allowedDomains: readonly string[]
  signal?: AbortSignal
  sourceBudget?: SourceFetchBudget
  budgetClient?: ExaBudgetRedis | null
  apiKey?: string
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function sourceUrl(value: unknown, domains: ReadonlySet<string>): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !domains.has(url.hostname)
    )
      return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

/** One session belongs to one research pipeline, including all its parallel waves. */
export function createExaSession(options: ExaSessionOptions) {
  const allowedDomains = new Set(options.allowedDomains.map((domain) => domain.toLowerCase()))
  const client = options.budgetClient === undefined ? getRedis() : options.budgetClient
  const apiKey = options.apiKey ?? process.env.EXA_API_KEY
  const sourceBudget = options.sourceBudget ?? currentSourceFetchBudget()
  let calls = 0
  let searches = 0
  let contentPages = 0

  async function request(
    endpoint: 'search' | 'contents',
    body: Record<string, unknown>,
    tariff: number,
    domains: ReadonlySet<string>
  ): Promise<ExaResponse> {
    options.signal?.throwIfAborted()
    if (!apiKey || process.env.EXA_ENABLED === 'false')
      return { status: 'skipped', reason: 'disabled' }
    if (sourceBudget?.exhausted) return { status: 'skipped', reason: 'source_budget' }
    if (calls >= CONFIG.exa.maxRequests) return { status: 'skipped', reason: 'request_limit' }
    // Increment before the first await: parallel source waves share this allowance.
    calls++
    const decision = await reserveExaBudget(tariff, client)
    if (decision.status !== 'reserved')
      return { status: 'skipped', reason: `budget_${decision.status}` }

    let sent = false
    let costUSD: number | undefined
    // Keep the deadline active through JSON/body consumption, not only headers.
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), CONFIG.exa.timeoutMs)
    const requestSignal = options.signal
      ? AbortSignal.any([options.signal, timeout.signal])
      : timeout.signal
    try {
      options.signal?.throwIfAborted()
      if (sourceBudget?.exhausted) return { status: 'skipped', reason: 'source_budget' }
      const fetchResponse = () =>
        fetchWithTimeout(
          `https://api.exa.ai/${endpoint}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey! },
            body: JSON.stringify(body),
            redirect: 'error',
          },
          CONFIG.exa.timeoutMs,
          requestSignal
        )
      // Once transport starts, timeouts and cancellation cannot establish that
      // Exa did not bill. Only a known pre-dispatch budget rejection refunds it.
      sent = true
      const response = await (sourceBudget ? sourceBudget.run(fetchResponse) : fetchResponse())
      let payload: Record<string, unknown> | undefined
      try {
        payload = object(await response.json())
      } catch (error) {
        if (requestSignal.aborted) throw error
        if (response.ok) return { status: 'error', reason: 'invalid_response' }
      }
      const reported = object(payload?.costDollars)?.total
      if (typeof reported === 'number' && Number.isFinite(reported) && reported >= 0)
        costUSD = reported
      if (!response.ok) {
        console.error(`[Exa] ${endpoint} HTTP ${response.status}`)
        return { status: 'error', reason: 'http_error', httpStatus: response.status }
      }
      if (!payload || !Array.isArray(payload.results))
        return { status: 'error', reason: 'invalid_response' }

      const documents: ExaDocument[] = []
      for (const raw of payload.results) {
        const entry = object(raw)
        const url = sourceUrl(entry?.url, domains)
        if (!url || typeof entry?.text !== 'string' || !entry.text.trim()) continue
        documents.push({
          url,
          text: entry.text,
          ...(typeof entry.title === 'string' ? { title: entry.title } : {}),
        })
      }
      const statuses: ExaUrlStatus[] = []
      for (const raw of Array.isArray(payload.statuses) ? payload.statuses : []) {
        const item = object(raw)
        if (typeof item?.id !== 'string' || typeof item.status !== 'string') continue
        const error = object(item.error)
        statuses.push({
          id: item.id,
          status: item.status,
          ...(typeof item.source === 'string' ? { source: item.source } : {}),
          ...(error
            ? {
                error: {
                  ...(typeof error.tag === 'string' ? { tag: error.tag } : {}),
                  ...(typeof error.httpStatusCode === 'number'
                    ? { httpStatusCode: error.httpStatusCode }
                    : {}),
                },
              }
            : {}),
        })
      }
      return {
        status: 'success',
        documents,
        statuses,
        ...(typeof payload.requestId === 'string' ? { requestId: payload.requestId } : {}),
        ...(costUSD === undefined ? {} : { costUSD }),
      }
    } catch (error) {
      if (error instanceof SourceFetchBudgetExceeded) {
        sent = false
        return { status: 'skipped', reason: 'source_budget' }
      }
      if (options.signal?.aborted) throw error
      console.error(`[Exa] ${endpoint} failed:`, safeError(error))
      return { status: 'error', reason: 'request_failed' }
    } finally {
      clearTimeout(timer)
      await settleExaBudget(decision.reservation, { sent, costUSD }, client)
    }
  }

  return {
    async contents(urls: readonly string[]): Promise<ExaResponse> {
      const unique = [...new Set(urls)]
      if (!unique.length || unique.some((url) => !sourceUrl(url, allowedDomains)))
        return { status: 'error', reason: 'invalid_source_url' }
      if (contentPages + unique.length > CONFIG.exa.maxContentPages)
        return { status: 'skipped', reason: 'content_limit' }
      contentPages += unique.length
      return request(
        'contents',
        { urls: unique, text: { includeHtmlTags: true, verbosity: 'full' } },
        unique.length * CONFIG.exa.contentPageCostMicros,
        allowedDomains
      )
    },

    async search(query: string, domains: readonly string[]): Promise<ExaResponse> {
      const selected = new Set(domains.map((domain) => domain.toLowerCase()))
      if (
        !query.trim() ||
        !selected.size ||
        [...selected].some((host) => !allowedDomains.has(host))
      )
        return { status: 'error', reason: 'invalid_search' }
      if (searches >= CONFIG.exa.maxSearches) return { status: 'skipped', reason: 'search_limit' }
      searches++
      return request(
        'search',
        {
          query,
          type: 'auto',
          numResults: CONFIG.exa.searchResults,
          includeDomains: [...selected],
          contents: { text: { includeHtmlTags: true, verbosity: 'full' } },
        },
        CONFIG.exa.searchCostMicros,
        selected
      )
    },
  }
}

export type ExaSession = ReturnType<typeof createExaSession>
