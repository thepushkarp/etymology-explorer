import { canonicalizeWord } from './orthography'
import { fetchWithTimeout } from './fetchUtils'
import { CONFIG } from './config'
import { cacheSource, getCachedSource } from './sourceCache'
import { sourceFailure, sourceHttpFailure } from './sourceOutcome'
import type { SourceData, SourceFetchOutcome } from './types'

const INCELS_WIKI_API = 'https://incels.wiki/api.php'
const MIN_EXTRACT_CHARS = 40

interface TitleTransition {
  from?: string
  to?: string
}

interface IncelsWikiResponse {
  error?: { code?: string; info?: string }
  query?: {
    normalized?: TitleTransition[]
    redirects?: TitleTransition[]
    pages?: Record<
      string,
      { title?: string; extract?: string; missing?: unknown; invalid?: unknown }
    >
  }
}

function buildPageUrl(title: string): string {
  return `https://incels.wiki/w/${encodeURIComponent(title.replace(/\s+/g, '_'))}`
}

/** Only a continuous, source-reported normalization/redirect chain can change identity. */
function resolvedTitle(word: string, data: IncelsWikiResponse): string | null {
  let title = word
  for (const transitions of [data.query?.normalized ?? [], data.query?.redirects ?? []]) {
    const seen = new Set<string>()
    for (let step = 0; step < transitions.length; step++) {
      const normalized = canonicalizeWord(title)
      if (seen.has(normalized)) return null
      seen.add(normalized)
      const transition = transitions.find(
        ({ from }) => typeof from === 'string' && canonicalizeWord(from) === normalized
      )
      if (!transition) break
      if (typeof transition.to !== 'string' || !transition.to.trim()) return null
      const destination = canonicalizeWord(transition.to)
      if (destination !== normalized && seen.has(destination)) return null
      title = transition.to
      if (destination === normalized) break
    }
  }
  return title
}

export async function fetchIncelsWikiOutcome(
  word: string,
  signal?: AbortSignal
): Promise<SourceFetchOutcome> {
  const normalizedWord = canonicalizeWord(word)
  signal?.throwIfAborted()
  const cached = await getCachedSource('incelsWiki', normalizedWord)
  signal?.throwIfAborted()
  if (cached) return { status: 'found', data: cached }

  const url = new URL(INCELS_WIKI_API)
  url.searchParams.set('action', 'query')
  url.searchParams.set('titles', normalizedWord)
  url.searchParams.set('redirects', '1')
  url.searchParams.set('prop', 'extracts')
  url.searchParams.set('explaintext', 'true')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')

  try {
    const response = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': 'EtymologyExplorer/1.0 (educational project)' } },
      CONFIG.timeouts.source,
      signal
    )
    if (!response.ok) return sourceHttpFailure(response, 'Incel Wiki')
    const data = (await response.json()) as IncelsWikiResponse
    if (data.error) {
      return {
        status: 'unavailable',
        reason: `Incel Wiki API: ${data.error.code ?? 'unknown error'}`,
      }
    }
    const pages = Object.values(data.query?.pages ?? {})
    if (pages.length !== 1) {
      return { status: 'no_evidence', reason: 'Incel Wiki did not identify one requested entry' }
    }
    const page = pages[0]
    if ('missing' in page || 'invalid' in page) return { status: 'not_found' }
    const resolved = resolvedTitle(normalizedWord, data)
    if (!resolved || !page.title || canonicalizeWord(page.title) !== canonicalizeWord(resolved)) {
      return {
        status: 'no_evidence',
        reason: 'Incel Wiki entry did not match the requested title or redirect',
      }
    }
    const text = typeof page.extract === 'string' ? page.extract.replace(/\r\n/g, '\n').trim() : ''
    if (text.length < MIN_EXTRACT_CHARS) {
      return { status: 'no_evidence', reason: 'Incel Wiki entry has no usable extract' }
    }
    const result: SourceData = {
      text,
      requestedWord: normalizedWord,
      resolvedWord: page.title,
      language: 'en',
      lexicalLanguage: 'English',
      evidenceRole: 'context',
      url: buildPageUrl(page.title),
      ...(canonicalizeWord(page.title) !== normalizedWord
        ? {
            variants: [
              {
                word: page.title,
                relationship: 'redirect' as const,
                url: buildPageUrl(page.title),
              },
            ],
          }
        : {}),
    }
    await cacheSource('incelsWiki', normalizedWord, result)
    return { status: 'found', data: result }
  } catch (error) {
    return sourceFailure(error, signal)
  }
}

/** Supplemental community context does not independently establish ancestry. */
export async function fetchIncelsWiki(
  word: string,
  signal?: AbortSignal
): Promise<SourceData | null> {
  const result = await fetchIncelsWikiOutcome(word, signal)
  return result.status === 'found' ? result.data : null
}
