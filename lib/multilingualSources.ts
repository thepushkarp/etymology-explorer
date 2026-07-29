import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { fetchWithTimeout } from './fetchUtils'
import { LANGUAGES, type BetaLanguageCode } from './languages'
import { cacheSource, getCachedSource, type CacheableSource } from './sourceCache'
import type { SourceData } from './types'
import { extractWiktionaryEntryGroups, type WiktionaryTocSection } from './wiktionaryEntryGroups'

type TocSection = WiktionaryTocSection

interface ParseResponse {
  parse?: {
    title?: string
    text?: string
    tocdata?: { sections?: TocSection[] }
  }
  error?: { info?: string }
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

/** Extracts only the selected language's etymology blocks using MediaWiki tocdata. */
export function extractTocEtymology(
  html: string,
  sections: TocSection[],
  languageHeading: string,
  etymologyHeading: RegExp
): string | null {
  const groups = extractWiktionaryEntryGroups(
    html,
    sections,
    languageHeading,
    etymologyHeading
  ).slice(0, 4)
  const text = groups
    .map((group) => group.text)
    .filter(Boolean)
    .join('\n\n')
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
    const entryGroups = extractWiktionaryEntryGroups(
      html,
      sections,
      languageHeading,
      edition === 'en' ? LANGUAGES.en.etymologyHeading : config.etymologyHeading
    ).slice(0, 4)
    const text = entryGroups
      .map((group) => group.text)
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 6000)
    if (!text) return null

    const result = {
      text,
      url: `https://${edition}.wiktionary.org/wiki/${encodeURIComponent(word)}`,
      entryGroups,
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

const WIKIDATA_LANGUAGE_ENTITY: Record<BetaLanguageCode, string> = {
  it: 'Q652',
  es: 'Q1321',
  fr: 'Q150',
  pt: 'Q5146',
}

interface WikidataMonolingualText {
  language?: string
  value?: string
}

interface WikidataLexemeEntity {
  id?: string
  type?: string
  language?: string
  lemmas?: Record<string, WikidataMonolingualText>
  forms?: Array<{
    id?: string
    representations?: Record<string, WikidataMonolingualText>
    grammaticalFeatures?: string[]
  }>
  senses?: Array<{
    id?: string
    glosses?: Record<string, WikidataMonolingualText>
  }>
  claims?: Record<string, unknown>
  [key: string]: unknown
}

function compactWikidataLexeme(entity: WikidataLexemeEntity) {
  const lexicalClaims = Object.fromEntries(
    Object.entries(entity.claims ?? {}).filter(([, statements]) =>
      JSON.stringify(statements).includes('"entity-type":"lexeme"')
    )
  )
  return {
    id: entity.id,
    type: entity.type,
    language: entity.language,
    lemmas: entity.lemmas,
    forms: (entity.forms ?? []).map((form) => ({
      id: form.id,
      representations: form.representations,
      grammaticalFeatures: form.grammaticalFeatures,
    })),
    senses: (entity.senses ?? []).map((sense) => ({
      id: sense.id,
      glosses: sense.glosses,
    })),
    ...(Object.keys(lexicalClaims).length > 0 ? { lexicalClaims } : {}),
  }
}

function normalizedLexicalValue(value: string, language: BetaLanguageCode): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase(language)
}

function isRequestedLanguageText(
  text: WikidataMonolingualText,
  language: BetaLanguageCode,
  normalizedWord: string
): boolean {
  if (typeof text?.language !== 'string' || typeof text.value !== 'string') return false
  const primaryLanguage = text.language.toLocaleLowerCase().split('-')[0]
  return (
    primaryLanguage === language && normalizedLexicalValue(text.value, language) === normalizedWord
  )
}

function isMatchingLexeme(
  entity: WikidataLexemeEntity,
  language: BetaLanguageCode,
  normalizedWord: string
): entity is WikidataLexemeEntity & { id: string } {
  if (
    typeof entity.id !== 'string' ||
    entity.type !== 'lexeme' ||
    entity.language !== WIKIDATA_LANGUAGE_ENTITY[language]
  ) {
    return false
  }

  const lemmaMatches = Object.values(entity.lemmas ?? {}).some((lemma) =>
    isRequestedLanguageText(lemma, language, normalizedWord)
  )
  const formMatches = (Array.isArray(entity.forms) ? entity.forms : []).some((form) =>
    Object.values(form.representations ?? {}).some((representation) =>
      isRequestedLanguageText(representation, language, normalizedWord)
    )
  )
  return lemmaMatches || formMatches
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
  // Search result language controls ranking/localization, not the lexeme's
  // language. Fetch a wider candidate set and validate the entities below.
  search.searchParams.set('limit', '20')
  search.searchParams.set('format', 'json')
  search.searchParams.set('origin', '*')
  try {
    const response = await fetchWithTimeout(search, {}, CONFIG.timeouts.source, signal)
    if (!response.ok) return null
    const data = (await response.json()) as { search?: Array<{ id?: string }> }
    const ids = (data.search ?? [])
      .map((entry) => entry.id)
      .filter((id): id is string => Boolean(id))
    if (ids.length === 0) return null
    const entitiesUrl = new URL('https://www.wikidata.org/w/api.php')
    entitiesUrl.searchParams.set('action', 'wbgetentities')
    entitiesUrl.searchParams.set('ids', ids.join('|'))
    // Lexeme subentities are part of the default entity representation;
    // wbgetentities does not accept lemmas/forms/senses as `props` values.
    entitiesUrl.searchParams.set('languages', language)
    entitiesUrl.searchParams.set('format', 'json')
    entitiesUrl.searchParams.set('origin', '*')
    const entitiesResponse = await fetchWithTimeout(entitiesUrl, {}, CONFIG.timeouts.source, signal)
    if (!entitiesResponse.ok) return null
    const entityData = (await entitiesResponse.json()) as {
      entities?: Record<string, WikidataLexemeEntity>
    }
    const normalizedWord = normalizedLexicalValue(word, language)
    const matches = Object.values(entityData.entities ?? {}).filter((entity) =>
      isMatchingLexeme(entity, language, normalizedWord)
    )
    if (matches.length === 0) return null
    const entities = Object.fromEntries(
      matches.map((entity) => [entity.id, compactWikidataLexeme(entity)])
    )
    const result = {
      text: JSON.stringify({ entities }),
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
