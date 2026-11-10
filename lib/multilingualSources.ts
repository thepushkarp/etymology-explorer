import { canonicalizeWord } from './orthography'
import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { fetchWithTimeout } from './fetchUtils'
import { LANGUAGES, type LanguageCode } from './languages'
import { cacheSource, getCachedSource } from './sourceCache'
import type { SourceData } from './types'
import { cleanWiktionaryHtml } from './wiktionaryEntryGroups'

import {
  fetchSelectedWiktionaryLanguage,
  fetchWiktionaryPage,
  extractWiktionaryLanguage,
  type WiktionaryFetchOptions,
} from './wiktionary'

/** Languages researched through their own Wiktionary edition and lexical sources. */
type NonEnglishLanguage = Exclude<LanguageCode, 'en'>

export async function fetchWiktionaryEdition(
  word: string,
  language: LanguageCode,
  edition: string,
  signal?: AbortSignal,
  options?: WiktionaryFetchOptions
): Promise<SourceData | null> {
  const config = LANGUAGES[language]
  if (edition === 'en')
    return fetchSelectedWiktionaryLanguage(word, config.englishWiktionaryHeading, signal, options)
  if (!config.nativeWiktionary || config.nativeWiktionary.edition !== edition) return null
  const cached = await getCachedSource('wiktionaryNative', word, undefined, language)
  if (cached) return cached
  try {
    const page = await fetchWiktionaryPage(word, edition, signal, options)
    const result = page && extractWiktionaryLanguage(page, config.nativeWiktionary.heading, edition)
    if (result) await cacheSource('wiktionaryNative', word, result, undefined, language)
    return result
  } catch (error) {
    signal?.throwIfAborted()
    console.error(`[Research] ${edition}.wiktionary fetch failed:`, safeError(error))
    return null
  }
}

export function fetchEnglishWiktionaryLanguage(
  word: string,
  language: NonEnglishLanguage,
  signal?: AbortSignal,
  options?: WiktionaryFetchOptions
): Promise<SourceData | null> {
  return fetchWiktionaryEdition(word, language, 'en', signal, options)
}

export function fetchNativeWiktionary(
  word: string,
  language: NonEnglishLanguage,
  signal?: AbortSignal,
  options?: WiktionaryFetchOptions
): Promise<SourceData | null> {
  const edition = LANGUAGES[language].nativeWiktionary?.edition
  return edition
    ? fetchWiktionaryEdition(word, language, edition, signal, options)
    : Promise.resolve(null)
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
  language: NonEnglishLanguage,
  normalizedWord: string
): boolean {
  if (typeof text?.language !== 'string' || typeof text.value !== 'string') return false
  const primaryLanguage = text.language.toLocaleLowerCase().split('-')[0]
  return primaryLanguage === language && canonicalizeWord(text.value) === normalizedWord
}

function isMatchingLexeme(
  entity: WikidataLexemeEntity,
  language: NonEnglishLanguage,
  normalizedWord: string
): entity is WikidataLexemeEntity & { id: string } {
  if (
    typeof entity.id !== 'string' ||
    entity.type !== 'lexeme' ||
    entity.language !== LANGUAGES[language].wikidataEntity
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
  language: NonEnglishLanguage,
  signal?: AbortSignal
): Promise<SourceData | null> {
  if (!LANGUAGES[language].wikidataEntity) return null
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
