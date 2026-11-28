import { publisherTitle, sameSpelling } from './orthography'
import type { SourceData } from './types'
import { LANGUAGES, languageFromName, type LanguageCode } from './languages'
import {
  cleanWiktionaryHtml,
  comparableHeading,
  extractWiktionaryLookup,
  extractWiktionaryEntryGroups,
  extractWiktionaryLanguageHtml,
  extractWiktionaryRomanizations,
  extractWiktionarySpellingRedirect,
  extractWiktionaryVariants,
  isWiktionarySpellingLemma,
  type WiktionaryTocSection,
} from './wiktionaryEntryGroups'
import { fetchWithTimeout } from './fetchUtils'
import { safeError } from './errorUtils'
import { CONFIG } from './config'
import {
  getCachedSource,
  getCachedSourceAndToc,
  cacheSource,
  cacheWiktionaryToc,
  type WiktionaryToc,
} from './sourceCache'
import { currentSourceFetchBudget } from './sourceFetchBudget'

export type WiktionaryResult = SourceData
export interface WiktionaryPage {
  requestedWord: string
  title: string
  redirects: Array<{ from: string; to: string }>
  html: string
  sections: WiktionaryTocSection[]
  revid?: number
  fetchedAt?: string
  toc?: WiktionaryToc
}

export interface WiktionaryFetchOptions {
  useCachedToc?: boolean
  retryTransient?: boolean
  fetchOnce?: <T>(key: string, fetcher: () => Promise<T>) => Promise<T>
}

/** Preserve heading anchors while excluding their labels from lexical admission. */
function withoutHeadingText(html: string): string {
  // Handle fragments sliced at an inner <span id="..."> inside an <h1-6> tag.
  const trimmedHead = html.replace(
    /^([\s\S]*?)(<\/h[1-6]>)/i,
    (match, body: string, close: string) =>
      /<h[1-6]\b/i.test(body) ? match : body.replace(/(^|>)[^<]*/g, '$1') + close
  )
  return trimmedHead.replace(
    /(<h[1-6]\b[^>]*>)([\s\S]*?)(<\/h[1-6]>)/gi,
    (_match, open: string, body: string, close: string) =>
      open + body.replace(/(^|>)[^<]*/g, '$1') + close
  )
}

export function wiktionaryPageToc(page: WiktionaryPage): WiktionaryToc {
  if (page.toc) return page.toc
  const headings = page.sections
    .filter((section) => (section.hLevel ?? Number(section.level)) === 2)
    .map((section) => cleanWiktionaryHtml(section.line))
  const otherScripts = extractWiktionaryRomanizations(page.html, page.sections, page.requestedWord)
  const toc: WiktionaryToc = {
    headings,
    ...(otherScripts.length ? { otherScripts } : {}),
    nonemptyHeadings: headings.filter((heading) => {
      const fragment = extractWiktionaryLanguageHtml(page.html, page.sections, heading)
      return Boolean(fragment && cleanWiktionaryHtml(withoutHeadingText(fragment)))
    }),
  }
  page.toc = toc
  return toc
}

/** Fetch one validated complete page; transient failures remain unknown rather than absent. */
export function fetchWiktionaryPage(
  word: string,
  edition = 'en',
  signal?: AbortSignal,
  options?: WiktionaryFetchOptions
): Promise<WiktionaryPage | null> {
  const normalizedWord = publisherTitle(word)
  const fetchPage = async (): Promise<WiktionaryPage | null> => {
    const url = new URL(`https://${edition}.wiktionary.org/w/api.php`)
    url.searchParams.set('action', 'parse')
    url.searchParams.set('page', normalizedWord)
    url.searchParams.set('prop', 'text|tocdata|revid')
    url.searchParams.set('format', 'json')
    url.searchParams.set('formatversion', '2')
    url.searchParams.set('redirects', 'true')
    const attempts = options?.retryTransient && !options.fetchOnce ? 2 : 1
    for (let attempt = 0; attempt < attempts; attempt++) {
      signal?.throwIfAborted()
      if (attempt > 0 && currentSourceFetchBudget()?.rateLimited)
        throw new Error(`Wiktionary ${edition}:${normalizedWord}: HTTP 429`)
      try {
        const response = await fetchWithTimeout(
          url.toString(),
          { headers: { 'User-Agent': 'EtymologyExplorer/1.0 (educational project)' } },
          CONFIG.timeouts.source,
          signal
        )
        if (!response.ok) {
          if (response.status === 404) {
            await cacheWiktionaryToc(normalizedWord, edition, {
              headings: [],
              nonemptyHeadings: [],
            })
            return null
          }
          if (response.headers.has('retry-after'))
            throw new Error(
              `Wiktionary ${edition}:${normalizedWord}: HTTP ${response.status} (Retry-After)`
            )
          if (attempt + 1 < attempts && (response.status === 408 || response.status >= 500)) {
            await response.body?.cancel()
            continue
          }
          throw new Error(`Wiktionary ${edition}:${normalizedWord}: HTTP ${response.status}`)
        }
        const data = (await response.json()) as {
          error?: { code?: string; info?: string }
          parse?: {
            title?: string
            redirects?: Array<{ from: string; to: string }>
            text?: string
            revid?: number
            tocdata?: { sections?: WiktionaryTocSection[] }
          }
        }
        if (data.error?.code === 'missingtitle') {
          await cacheWiktionaryToc(normalizedWord, edition, { headings: [], nonemptyHeadings: [] })
          return null
        }
        const page = data.parse
        if (!page?.text || !Array.isArray(page.tocdata?.sections))
          throw new Error(`Wiktionary ${edition}:${normalizedWord}: invalid parse response`)
        if (
          page.title &&
          publisherTitle(page.title) !== normalizedWord &&
          !page.redirects?.some(
            (redirect) =>
              publisherTitle(redirect.from) === normalizedWord &&
              publisherTitle(redirect.to) === publisherTitle(page.title!)
          )
        )
          return null
        const result: WiktionaryPage = {
          requestedWord: normalizedWord,
          title: page.title ?? normalizedWord,
          redirects: page.redirects ?? [],
          html: page.text,
          sections: page.tocdata.sections,
          revid: page.revid,
          fetchedAt: new Date().toISOString(),
        }
        await cacheWiktionaryToc(normalizedWord, edition, wiktionaryPageToc(result))
        return result
      } catch (error) {
        signal?.throwIfAborted()
        if (
          attempt + 1 < attempts &&
          (error instanceof TypeError || /Request timeout/i.test(safeError(error)))
        )
          continue
        throw error
      }
    }
    return null
  }
  if (!options?.fetchOnce) return fetchPage()
  const key = `wiktionaryPage:${edition}:${normalizedWord}`
  return options.fetchOnce(key, fetchPage).catch((error) => {
    signal?.throwIfAborted()
    // A failed resolution request is shared, but an ancestor may make the one allowed retry.
    // Memoizing the retry separately prevents concurrent histories from multiplying attempts.
    if (
      options.retryTransient &&
      !safeError(error).includes('Retry-After') &&
      !currentSourceFetchBudget()?.rateLimited &&
      (error instanceof TypeError || /Request timeout|HTTP (?:408|5\d\d)\b/i.test(safeError(error)))
    )
      return options.fetchOnce!(`${key}:retry`, fetchPage)
    throw error
  })
}

/** Source-local extraction preserves complete text and independent history boundaries. */
export function extractWiktionaryLanguage(
  page: WiktionaryPage,
  heading: string,
  edition = 'en'
): WiktionaryResult | null {
  const native = Object.values(LANGUAGES).find(
    (language) =>
      language.nativeWiktionary?.edition === edition &&
      language.nativeWiktionary.heading === heading
  )
  const language = edition === 'en' ? languageFromName(heading) : native?.code
  const pattern =
    edition === 'en' ? /^Etymology(?:\s+\d+)?$/i : native?.nativeWiktionary?.etymologyHeading
  if (!pattern) return null
  const fragment = extractWiktionaryLanguageHtml(page.html, page.sections, heading)
  const text = fragment ? cleanWiktionaryHtml(fragment) : ''
  if (!text || !cleanWiktionaryHtml(withoutHeadingText(fragment))) return null
  const url = `https://${edition}.wiktionary.org/wiki/${encodeURIComponent(page.title)}`
  const variants: NonNullable<SourceData['variants']> = extractWiktionaryVariants(
    page.html,
    page.sections,
    heading,
    edition
  )
  if (!sameSpelling(page.title, page.requestedWord))
    variants.push({ word: page.title, relationship: 'redirect', url })
  return {
    text,
    url,
    ...(edition === 'en'
      ? { lookup: extractWiktionaryLookup(page.html, page.sections, heading, page.requestedWord) }
      : {}),
    entryGroups: extractWiktionaryEntryGroups(
      page.html,
      page.sections,
      heading,
      pattern,
      page.requestedWord,
      { title: page.title, edition }
    ),
    variants,
    ...(edition === 'en' && language && LANGUAGES[language].spellingIdentity
      ? {
          spellingRedirect: extractWiktionarySpellingRedirect(
            page.html,
            page.sections,
            heading,
            page.requestedWord,
            edition
          ),
          spellingLemma: isWiktionarySpellingLemma(
            page.html,
            page.sections,
            heading,
            page.requestedWord,
            page.title
          ),
        }
      : {}),
    requestedWord: page.requestedWord,
    resolvedWord: page.title,
    revisionId: page.revid,
    retrieval: { method: 'direct', retrievedAt: page.fetchedAt ?? new Date().toISOString() },
    ...(language ? { language } : {}),
  }
}

/** All English-edition sections share one persisted namespace across lexical purposes. */
export async function fetchSelectedWiktionaryLanguage(
  word: string,
  languageHeading: string,
  signal?: AbortSignal,
  options?: WiktionaryFetchOptions
): Promise<WiktionaryResult | null> {
  return fetchDictionarySection(word, 'en', languageHeading, 'en', signal, options)
}

export async function fetchDictionarySection(
  word: string,
  edition: string,
  languageHeading: string,
  cacheLanguage: LanguageCode,
  signal?: AbortSignal,
  options?: WiktionaryFetchOptions
): Promise<WiktionaryResult | null> {
  const source =
    edition === 'en'
      ? (`wiktionaryLanguage:${encodeURIComponent(languageHeading)}` as const)
      : 'wiktionaryNative'
  let cached: WiktionaryResult | null
  let prefetchedToc: WiktionaryToc | null = null
  if (options?.useCachedToc) {
    const batch = await getCachedSourceAndToc(source, word, edition, cacheLanguage)
    cached = batch.source
    prefetchedToc = batch.toc
  } else {
    cached = await getCachedSource(source, word, undefined, cacheLanguage)
  }
  if (cached) return cached
  try {
    const toc = options?.useCachedToc ? prefetchedToc : null
    if (
      toc &&
      !toc.nonemptyHeadings.some(
        (heading) => comparableHeading(heading) === comparableHeading(languageHeading)
      )
    )
      return null
    const page = await fetchWiktionaryPage(word, edition, signal, options)
    const result = page && extractWiktionaryLanguage(page, languageHeading, edition)
    if (result) await cacheSource(source, word, result, undefined, cacheLanguage)
    return result
  } catch (error) {
    signal?.throwIfAborted()
    console.error('Wiktionary fetch failed for "%s":', word, safeError(error))
    throw error
  }
}

export function fetchWiktionary(
  word: string,
  signal?: AbortSignal,
  options?: WiktionaryFetchOptions
): Promise<WiktionaryResult | null> {
  return fetchSelectedWiktionaryLanguage(word, 'English', signal, options)
}
