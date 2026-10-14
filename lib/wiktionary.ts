import { canonicalizeWord, sameSpelling } from './orthography'
import type { SourceData } from './types'
import {
  extractWiktionaryEntryGroups,
  extractWiktionaryLanguageText,
  extractWiktionaryVariants,
  type WiktionaryTocSection,
} from './wiktionaryEntryGroups'
import { fetchWithTimeout } from './fetchUtils'
import { safeError } from './errorUtils'
import { CONFIG } from './config'
import { getCachedSource, cacheSource } from './sourceCache'

export type WiktionaryResult = SourceData

/** Complete, source-selected language lookup, including definition-only entries. */
export async function fetchSelectedWiktionaryLanguage(
  word: string,
  languageHeading: string,
  signal?: AbortSignal
): Promise<WiktionaryResult | null> {
  const normalizedWord = canonicalizeWord(word)
  // Historical languages are independent lexemes even on the same page.
  // Preserve the established English namespace for primary and ancestor lookups.
  const source =
    languageHeading === 'English'
      ? 'wiktionary'
      : (`wiktionaryLanguage:${encodeURIComponent(languageHeading)}` as const)
  const cached = await getCachedSource(source, normalizedWord)
  if (cached) return cached
  const url = new URL('https://en.wiktionary.org/w/api.php')
  url.searchParams.set('action', 'parse')
  url.searchParams.set('page', normalizedWord)
  url.searchParams.set('prop', 'text|tocdata|revid')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('redirects', 'true')
  try {
    const response = await fetchWithTimeout(
      url.toString(),
      {
        headers: { 'User-Agent': 'EtymologyExplorer/1.0 (educational project)' },
      },
      CONFIG.timeouts.source,
      signal
    )
    if (!response.ok) return null
    const data = (await response.json()) as {
      parse?: {
        title?: string
        redirects?: Array<{ from: string; to: string }>
        text?: string
        revid?: number
        tocdata?: { sections?: WiktionaryTocSection[] }
      }
    }
    const page = data.parse
    if (!page?.text || !page.tocdata?.sections) return null
    if (
      page.title &&
      !sameSpelling(page.title, normalizedWord) &&
      !page.redirects?.some(
        (redirect) =>
          sameSpelling(redirect.from, normalizedWord) && sameSpelling(redirect.to, page.title!)
      )
    )
      return null
    const entryGroups = extractWiktionaryEntryGroups(
      page.text,
      page.tocdata.sections,
      languageHeading,
      /^Etymology(?:\s+\d+)?$/i
    )
    const text = extractWiktionaryLanguageText(page.text, page.tocdata.sections, languageHeading)
    if (!text) return null
    const resolvedWord = page.title ?? normalizedWord
    const pageUrl = `https://en.wiktionary.org/wiki/${encodeURIComponent(resolvedWord)}`
    const variants: WiktionaryResult['variants'] = extractWiktionaryVariants(
      page.text,
      page.tocdata.sections,
      languageHeading
    )
    if (!sameSpelling(resolvedWord, normalizedWord)) {
      variants.push({ word: resolvedWord, relationship: 'redirect', url: pageUrl })
    }
    const result: WiktionaryResult = {
      text,
      url: pageUrl,
      entryGroups,
      variants,
      requestedWord: normalizedWord,
      resolvedWord,
      revisionId: page.revid,
      ...(languageHeading === 'English' ? { language: 'en' as const } : {}),
    }
    void cacheSource(source, normalizedWord, result)
    return result
  } catch (error) {
    console.error('Wiktionary fetch error:', safeError(error))
    return null
  }
}

export async function fetchWiktionary(
  word: string,
  signal?: AbortSignal
): Promise<WiktionaryResult | null> {
  return fetchSelectedWiktionaryLanguage(word, 'English', signal)
}
