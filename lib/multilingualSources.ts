import { canonicalizeWord } from './orthography'
import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { fetchWithTimeout } from './fetchUtils'
import { LANGUAGES, type BetaLanguageCode, type LanguageCode } from './languages'
import { cacheSource, getCachedSource, type CacheableSource } from './sourceCache'
import type { SourceData } from './types'
import {
  cleanWiktionaryHtml,
  extractWiktionaryEntryGroups,
  extractWiktionaryLanguageText,
  extractWiktionaryVariants,
  type WiktionaryTocSection,
} from './wiktionaryEntryGroups'

type TocSection = WiktionaryTocSection

interface ParseResponse {
  parse?: {
    title?: string
    redirects?: Array<{ from: string; to: string }>
    revid?: number
    text?: string
    tocdata?: { sections?: TocSection[] }
  }
  error?: { info?: string }
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
  url.searchParams.set('prop', 'text|tocdata|revid')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  url.searchParams.set('origin', '*')
  url.searchParams.set('redirects', 'true')

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
    if (
      data.parse?.title &&
      canonicalizeWord(data.parse.title) !== canonicalizeWord(word) &&
      !data.parse.redirects?.some(
        (redirect) =>
          canonicalizeWord(redirect.from) === canonicalizeWord(word) &&
          canonicalizeWord(redirect.to) === canonicalizeWord(data.parse!.title!)
      )
    )
      return null

    const languageHeading =
      edition === 'en' ? config.englishWiktionaryHeading : config.nativeWiktionaryHeading
    const entryGroups = extractWiktionaryEntryGroups(
      html,
      sections,
      languageHeading,
      edition === 'en' ? LANGUAGES.en.etymologyHeading : config.etymologyHeading
    )
    const text = extractWiktionaryLanguageText(html, sections, languageHeading)
    if (!text) return null

    const result = {
      text,
      url: `https://${edition}.wiktionary.org/wiki/${encodeURIComponent(data.parse?.title ?? word)}`,
      entryGroups,
      requestedWord: word,
      resolvedWord: data.parse?.title ?? word,
      language,
      revisionId: data.parse?.revid,
      variants: [
        ...extractWiktionaryVariants(html, sections, languageHeading, edition),
        ...(data.parse?.title && canonicalizeWord(data.parse.title) !== canonicalizeWord(word)
          ? [
              {
                word: data.parse.title,
                relationship: 'redirect' as const,
                url: `https://${edition}.wiktionary.org/wiki/${encodeURIComponent(data.parse.title)}`,
              },
            ]
          : []),
      ],
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
  language: LanguageCode,
  signal?: AbortSignal
): Promise<SourceData | null> {
  const cached = await getCachedSource('multilingualDictionary', word, undefined, language)
  if (cached) return cached
  const url = `https://freedictionaryapi.com/api/v1/entries/${language}/${encodeURIComponent(word)}`
  try {
    const response = await fetchWithTimeout(url, {}, CONFIG.timeouts.source, signal)
    if (!response.ok) return null
    const data = (await response.json()) as {
      word?: string
      entries?: unknown[]
      source?: { url?: string; license?: { name?: string; url?: string } }
    }
    if (data.word && canonicalizeWord(data.word) !== canonicalizeWord(word)) return null
    if (!Array.isArray(data.entries) || data.entries.length === 0) return null
    const entries = data.entries.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false
      const { word: headword, language: entryLanguage } = entry as {
        word?: unknown
        language?: { code?: unknown }
      }
      if (entryLanguage?.code !== undefined && entryLanguage.code !== language) return false
      return (
        headword === undefined ||
        (typeof headword === 'string' && canonicalizeWord(headword) === canonicalizeWord(word))
      )
    })
    if (entries.length === 0) return null
    const result = {
      text: JSON.stringify({ entries, source: data.source }),
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
    claims: entity.claims,
  }
}

function isRequestedLanguageText(
  text: WikidataMonolingualText,
  language: BetaLanguageCode,
  normalizedWord: string
): boolean {
  if (typeof text?.language !== 'string' || typeof text.value !== 'string') return false
  const primaryLanguage = text.language.toLocaleLowerCase().split('-')[0]
  return primaryLanguage === language && canonicalizeWord(text.value) === normalizedWord
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
    const normalizedWord = canonicalizeWord(word)
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
    const entries = (await response.json()) as Array<{ word?: string; xml?: string }>
    const xml = entries
      .filter((entry) => !entry.word || canonicalizeWord(entry.word) === canonicalizeWord(word))
      .map((entry) => entry.xml)
      .filter(Boolean)
      .join('\n')
    if (!xml) return null
    const result = {
      text: `Historical dictionary (older source): ${cleanWiktionaryHtml(xml)}`,
      url,
    }
    void cacheSource('dicionarioAberto', word, result, undefined, 'pt')
    return result
  } catch (error) {
    console.error('[Research] Dicionário Aberto fetch failed:', safeError(error))
    return null
  }
}
