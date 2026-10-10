import { sameSpelling } from './orthography'
import type { SourceData } from './types'
import { fetchWithTimeout } from './fetchUtils'
import { CONFIG } from './config'
import type { LanguageCode } from './languages'
import { SUPPORTED_LANGUAGE_CODES } from './languages'
import { cacheSource, getCachedSource } from './sourceCache'

type WikipediaSource = SourceData & {
  requestedWord: string
  resolvedWord: string
  language: LanguageCode
  revisionId?: number
  variants?: { word: string; relationship: 'redirect'; url: string }[]
}

export async function fetchWikipedia(
  word: string,
  signal?: AbortSignal,
  language: LanguageCode = 'en'
): Promise<SourceData | null> {
  if (!SUPPORTED_LANGUAGE_CODES.includes(language)) return null
  signal?.throwIfAborted()
  const cached = await getCachedSource('wikipedia', word, undefined, language)
  signal?.throwIfAborted()
  if (cached) return cached

  try {
    const origin = `https://${language}.wikipedia.org`
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      titles: word,
      prop: 'extracts|info|pageprops|revisions',
      explaintext: '1',
      inprop: 'url',
      rvprop: 'ids',
    })
    const response = await fetchWithTimeout(
      `${origin}/w/api.php?${params}`,
      { headers: { 'User-Agent': 'EtymologyExplorer/1.0' } },
      CONFIG.timeouts.source,
      signal
    )
    if (!response.ok) return null
    const data = await response.json()
    signal?.throwIfAborted()
    const query = data.query
    const page = query?.pages?.[0]
    if (
      !page ||
      page.missing ||
      page.invalid ||
      page.ns !== 0 ||
      typeof page.title !== 'string' ||
      typeof page.extract !== 'string' ||
      !page.extract.trim() ||
      page.pageprops?.disambiguation !== undefined
    )
      return null

    // Accept only the exact title or an explicit, continuous API redirect chain.
    let resolved = word
    const normalized = query.normalized ?? []
    if (!Array.isArray(normalized) || normalized.length > 1) return null
    for (const mapping of normalized) {
      if (!sameSpelling(mapping.from, resolved) || !sameSpelling(mapping.to, resolved)) return null
      resolved = mapping.to
    }
    const redirects = query.redirects ?? []
    if (!Array.isArray(redirects) || redirects.length > 5) return null
    const seen = new Set<string>()
    for (const redirect of redirects) {
      if (
        typeof redirect.from !== 'string' ||
        typeof redirect.to !== 'string' ||
        !sameSpelling(redirect.from, resolved) ||
        redirect.tofragment ||
        seen.has(redirect.to)
      )
        return null
      seen.add(redirect.to)
      resolved = redirect.to
    }
    if (!sameSpelling(resolved, page.title)) return null
    // Redirects to named films, people, etc. are not evidence for the queried phrase.
    if (!sameSpelling(word, page.title) && /\([^)]*\)$/.test(page.title)) return null
    const canonical = new URL(
      page.fullurl || `${origin}/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`
    )
    if (canonical.origin !== origin || !canonical.pathname.startsWith('/wiki/') || canonical.hash)
      return null
    const urlTitle = decodeURIComponent(canonical.pathname.slice(6)).replace(/_/g, ' ')
    if (!sameSpelling(urlTitle, page.title)) return null
    const result: WikipediaSource = {
      text: page.extract,
      url: canonical.href,
      requestedWord: word,
      resolvedWord: page.title,
      language,
      ...(Number.isInteger(page.revisions?.[0]?.revid)
        ? { revisionId: page.revisions[0].revid }
        : {}),
      ...(redirects.length
        ? { variants: [{ word: page.title, relationship: 'redirect', url: canonical.href }] }
        : {}),
    }
    await cacheSource('wikipedia', word, result, undefined, language)
    signal?.throwIfAborted()
    return result
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
}
