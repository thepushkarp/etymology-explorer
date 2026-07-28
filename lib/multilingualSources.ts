import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { fetchWithTimeout } from './fetchUtils'
import { LANGUAGES, type BetaLanguageCode } from './languages'
import { cacheSource, getCachedSource, type CacheableSource } from './sourceCache'
import type { SourceData } from './types'

interface TocSection {
  index: string
  line: string
  anchor: string
  hLevel?: number
  level?: string
  number: string
}

interface ParseResponse {
  parse?: {
    title?: string
    text?: string
    tocdata?: { sections?: TocSection[] }
  }
  error?: { info?: string }
}

function comparableHeading(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase()
}

function headingLevel(section: TocSection): number {
  return section.hLevel ?? Number(section.level)
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function anchorOffset(html: string, anchor: string): number {
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`(?:id|href)=["']#?${escaped}["']`, 'i'))
  return match?.index ?? -1
}

/** Extracts only the selected language's etymology blocks using MediaWiki tocdata. */
export function extractTocEtymology(
  html: string,
  sections: TocSection[],
  languageHeading: string,
  etymologyHeading: RegExp
): string | null {
  const language = sections.find(
    (section) => comparableHeading(section.line) === comparableHeading(languageHeading)
  )
  if (!language) return null

  const languageLevel = headingLevel(language)
  const languageIndex = sections.indexOf(language)
  const nextLanguage = sections
    .slice(languageIndex + 1)
    .find((section) => headingLevel(section) <= languageLevel)
  const withinLanguage = sections.slice(
    languageIndex + 1,
    nextLanguage ? sections.indexOf(nextLanguage) : sections.length
  )
  const etymologies = withinLanguage.filter((section) =>
    etymologyHeading.test(section.line.replace(/<[^>]+>/g, '').trim())
  )

  const selected = etymologies.length > 0 ? etymologies : [language]
  const blocks = selected.slice(0, 4).map((section) => {
    const start = anchorOffset(html, section.anchor)
    if (start < 0) return ''
    const sectionLevel = headingLevel(section)
    const currentIndex = sections.indexOf(section)
    const next = sections
      .slice(currentIndex + 1)
      .find((candidate) => headingLevel(candidate) <= sectionLevel)
    const end = next ? anchorOffset(html, next.anchor) : html.length
    return stripHtml(html.slice(start, end > start ? end : html.length))
  })

  const text = blocks.filter(Boolean).join('\n\n')
  return text.length > 0 ? text.slice(0, 6000) : null
}

async function fetchWiktionaryEdition(
  word: string,
  language: BetaLanguageCode,
  edition: 'en' | BetaLanguageCode,
  signal?: AbortSignal
): Promise<SourceData | null> {
  const config = LANGUAGES[language]
  const source: CacheableSource = edition === 'en' ? 'wiktionaryEnglish' : 'wiktionaryNative'
  const cached = await getCachedSource(source, word, undefined, language)
  if (cached) return cached

  const url = new URL(`https://${edition}.wiktionary.org/w/api.php`)
  url.searchParams.set('action', 'parse')
  url.searchParams.set('page', word)
  url.searchParams.set('prop', 'text|tocdata')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('origin', '*')

  try {
    const response = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': 'EtymologyExplorer/1.0 (educational project)' } },
      CONFIG.timeouts.source,
      signal
    )
    if (!response.ok) return null
    const data = (await response.json()) as ParseResponse
    const html = data.parse?.text
    const sections = data.parse?.tocdata?.sections
    if (!html || !sections) return null

    const languageHeading =
      edition === 'en' ? config.englishWiktionaryHeading : config.nativeWiktionaryHeading
    const text = extractTocEtymology(html, sections, languageHeading, config.etymologyHeading)
    if (!text) return null

    const result = {
      text,
      url: `https://${edition}.wiktionary.org/wiki/${encodeURIComponent(word)}`,
    }
    void cacheSource(source, word, result, undefined, language)
    return result
  } catch (error) {
    console.error(`[Research] ${edition}.wiktionary fetch failed:`, safeError(error))
    return null
  }
}

export function fetchEnglishWiktionaryLanguage(
  word: string,
  language: BetaLanguageCode,
  signal?: AbortSignal
): Promise<SourceData | null> {
  return fetchWiktionaryEdition(word, language, 'en', signal)
}

export function fetchNativeWiktionary(
  word: string,
  language: BetaLanguageCode,
  signal?: AbortSignal
): Promise<SourceData | null> {
  return fetchWiktionaryEdition(word, language, language, signal)
}

export async function fetchFreeDictionaryApi(
  word: string,
  language: BetaLanguageCode,
  signal?: AbortSignal
): Promise<SourceData | null> {
  const cached = await getCachedSource('multilingualDictionary', word, undefined, language)
  if (cached) return cached
  const url = `https://freedictionaryapi.com/api/v1/entries/${language}/${encodeURIComponent(word)}`
  try {
    const response = await fetchWithTimeout(url, {}, CONFIG.timeouts.source, signal)
    if (!response.ok) return null
    const data = (await response.json()) as {
      entries?: unknown[]
      source?: { url?: string; license?: { name?: string; url?: string } }
    }
    if (!Array.isArray(data.entries) || data.entries.length === 0) return null
    const result = {
      text: JSON.stringify({ entries: data.entries.slice(0, 3), source: data.source }).slice(
        0,
        5000
      ),
      url: data.source?.url || url,
    }
    void cacheSource('multilingualDictionary', word, result, undefined, language)
    return result
  } catch (error) {
    console.error('[Research] FreeDictionaryAPI fetch failed:', safeError(error))
    return null
  }
}

export async function fetchWikidataLexeme(
  word: string,
  language: BetaLanguageCode,
  signal?: AbortSignal
): Promise<SourceData | null> {
  const cached = await getCachedSource('wikidataLexeme', word, undefined, language)
  if (cached) return cached
  const search = new URL('https://www.wikidata.org/w/api.php')
  search.searchParams.set('action', 'wbsearchentities')
  search.searchParams.set('search', word)
  search.searchParams.set('language', language)
  search.searchParams.set('uselang', language)
  search.searchParams.set('type', 'lexeme')
  search.searchParams.set('limit', '5')
  search.searchParams.set('format', 'json')
  search.searchParams.set('origin', '*')
  try {
    const response = await fetchWithTimeout(search, {}, CONFIG.timeouts.source, signal)
    if (!response.ok) return null
    const data = (await response.json()) as { search?: Array<{ id?: string; label?: string }> }
    const matches = (data.search ?? []).filter(
      (entry) => entry.label?.toLocaleLowerCase() === word.toLocaleLowerCase()
    )
    if (matches.length === 0) return null
    const ids = matches
      .map((entry) => entry.id)
      .filter((id): id is string => Boolean(id))
      .slice(0, 3)
    const entitiesUrl = new URL('https://www.wikidata.org/w/api.php')
    entitiesUrl.searchParams.set('action', 'wbgetentities')
    entitiesUrl.searchParams.set('ids', ids.join('|'))
    entitiesUrl.searchParams.set('props', 'lemmas|forms|senses|claims')
    entitiesUrl.searchParams.set('languages', language)
    entitiesUrl.searchParams.set('format', 'json')
    entitiesUrl.searchParams.set('origin', '*')
    const entitiesResponse = await fetchWithTimeout(entitiesUrl, {}, CONFIG.timeouts.source, signal)
    const entities = entitiesResponse.ok ? await entitiesResponse.json() : { search: matches }
    const result = {
      text: JSON.stringify(entities).slice(0, 6000),
      url: `https://www.wikidata.org/wiki/${matches[0].id}`,
    }
    void cacheSource('wikidataLexeme', word, result, undefined, language)
    return result
  } catch (error) {
    console.error('[Research] Wikidata Lexeme fetch failed:', safeError(error))
    return null
  }
}

export async function fetchDicionarioAberto(
  word: string,
  signal?: AbortSignal
): Promise<SourceData | null> {
  const cached = await getCachedSource('dicionarioAberto', word, undefined, 'pt')
  if (cached) return cached
  const url = `https://api.dicionario-aberto.net/word/${encodeURIComponent(word)}`
  try {
    const response = await fetchWithTimeout(url, {}, CONFIG.timeouts.source, signal)
    if (!response.ok) return null
    const entries = (await response.json()) as Array<{ xml?: string }>
    const xml = entries
      .map((entry) => entry.xml)
      .filter(Boolean)
      .join('\n')
    if (!xml) return null
    const result = {
      text: `Historical dictionary (older source): ${stripHtml(xml)}`.slice(0, 5000),
      url,
    }
    void cacheSource('dicionarioAberto', word, result, undefined, 'pt')
    return result
  } catch (error) {
    console.error('[Research] Dicionário Aberto fetch failed:', safeError(error))
    return null
  }
}
