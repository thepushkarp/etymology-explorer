import { canonicalizeWord } from './orthography'
/**
 * Redis cache for complete source lookups, including historical-language selections.
 * Fails open: no Redis, or any Redis error, means a normal live fetch.
 */

import { CONFIG } from './config'
import { getRedis } from './redis'
import { safeError } from './errorUtils'
import type { ScriptTarget, SourceData, SourceRecord } from './types'
import { normalizeScriptTargets } from './scriptTargets'
import { SOURCE_PROVIDER_IDS, SOURCE_FAMILY_IDS } from './sourceProviders'
import type { LanguageCode } from './languages'

/**
 * Minimal Redis surface used by this module (allows in-memory test doubles).
 * Objects are passed through as-is: @upstash/redis serializes on write and
 * deserializes on read.
 */
export interface SourceCacheRedis {
  get(key: string): Promise<unknown>
  set(
    key: string,
    value: SourceData | SourceRecord[] | WiktionaryToc,
    opts?: { ex?: number }
  ): Promise<unknown>
}

export type CacheableSource =
  | 'wikipedia'
  | 'etymonline'
  | 'wiktionary'
  | `wiktionaryLanguage:${string}`
  | 'wiktionaryEnglish'
  | 'wiktionaryNative'
  | 'wikidataLexeme'
  | 'multilingualDictionary'
  | 'dicionarioAberto'
  | 'incelsWiki'

const SOURCE_CACHE_PREFIX = 'src:v11:'

function sourceKey(source: CacheableSource, word: string, language: LanguageCode): string {
  const normalized = canonicalizeWord(word)
  return language === 'en'
    ? `${SOURCE_CACHE_PREFIX}${source}:${normalized}`
    : `${SOURCE_CACHE_PREFIX}${source}:${language}:${normalized}`
}

function isSourceData(value: unknown): value is SourceData {
  if (!value || typeof value !== 'object') return false
  const maybe = value as { text?: unknown; url?: unknown; relatedEntries?: unknown }
  if (typeof maybe.text !== 'string' || typeof maybe.url !== 'string') return false
  if (maybe.relatedEntries !== undefined && !Array.isArray(maybe.relatedEntries)) return false
  return true
}

/**
 * Get cached raw source data for a word. Returns null on miss, malformed
 * entry, or Redis error (fail open — the caller fetches live).
 */
export async function getCachedSource(
  source: CacheableSource,
  word: string,
  client: SourceCacheRedis | null = getRedis(),
  language: LanguageCode = 'en'
): Promise<SourceData | null> {
  if (!client) return null

  try {
    const raw = await client.get(sourceKey(source, word, language))
    return isSourceData(raw) ? raw : null
  } catch (error) {
    console.error(`[SourceCache] ${source} get error:`, safeError(error))
    return null
  }
}

/**
 * Cache raw source data for a word (7d TTL). Fails silently — the live
 * fetch already succeeded, so a failed cache write costs nothing.
 */
export async function cacheSource(
  source: CacheableSource,
  word: string,
  data: SourceData,
  client: SourceCacheRedis | null = getRedis(),
  language: LanguageCode = 'en'
): Promise<void> {
  if (!client || data.incomplete) return

  try {
    await client.set(sourceKey(source, word, language), data, { ex: CONFIG.sourceCacheTTL })
  } catch (error) {
    console.error(`[SourceCache] ${source} set error:`, safeError(error))
  }
}

/** A provider request can return several independent dictionaries or homographs. */
function bundleKey(provider: string, word: string, lexicalLanguage: string): string {
  return `${SOURCE_CACHE_PREFIX}bundle:${encodeURIComponent(provider)}:${encodeURIComponent(lexicalLanguage)}:${canonicalizeWord(word)}`
}

export async function getCachedSourceBundle(
  provider: string,
  word: string,
  lexicalLanguage: string,
  client: SourceCacheRedis | null = getRedis()
): Promise<SourceRecord[] | null> {
  if (!client) return null
  try {
    const raw = await client.get(bundleKey(provider, word, lexicalLanguage))
    if (!Array.isArray(raw) || raw.length === 0) return null
    return raw.every(
      (record) =>
        record &&
        typeof record === 'object' &&
        (SOURCE_PROVIDER_IDS as readonly unknown[]).includes(record.provider) &&
        (SOURCE_FAMILY_IDS as readonly unknown[]).includes(record.sourceFamily) &&
        isSourceData(record.data)
    )
      ? (raw as SourceRecord[])
      : null
  } catch (error) {
    console.error(`[SourceCache] ${provider} bundle read failed:`, safeError(error))
    return null
  }
}

export async function cacheSourceBundle(
  provider: string,
  word: string,
  lexicalLanguage: string,
  records: SourceRecord[],
  client: SourceCacheRedis | null = getRedis()
): Promise<void> {
  if (!client || records.length === 0 || records.some((record) => record.data.incomplete)) return
  try {
    await client.set(bundleKey(provider, word, lexicalLanguage), records, {
      ex: CONFIG.sourceCacheTTL,
    })
  } catch (error) {
    console.error(`[SourceCache] ${provider} bundle write failed:`, safeError(error))
  }
}

/** Confirmed page headings, including empty lists for authoritative missing pages. */
export interface WiktionaryToc {
  headings: string[]
  nonemptyHeadings: string[]
  otherScripts?: ScriptTarget[]
}

function wiktionaryTocKey(word: string, edition: string): string {
  return `${SOURCE_CACHE_PREFIX}wiktionaryToc:${edition === 'en' ? '' : `${edition}:`}${canonicalizeWord(word)}`
}

export async function getCachedWiktionaryToc(
  word: string,
  edition = 'en',
  client: SourceCacheRedis | null = getRedis()
): Promise<WiktionaryToc | null> {
  if (!client) return null
  try {
    const raw = (await client.get(wiktionaryTocKey(word, edition))) as Partial<WiktionaryToc> | null
    return raw &&
      Array.isArray(raw.headings) &&
      Array.isArray(raw.nonemptyHeadings) &&
      raw.headings.every((heading) => typeof heading === 'string') &&
      raw.nonemptyHeadings.every((heading) => typeof heading === 'string')
      ? {
          headings: raw.headings,
          nonemptyHeadings: raw.nonemptyHeadings,
          ...(raw.otherScripts !== undefined
            ? { otherScripts: normalizeScriptTargets(raw.otherScripts) }
            : {}),
        }
      : null
  } catch (error) {
    console.error('[SourceCache] Wiktionary TOC read failed:', safeError(error))
    return null
  }
}

export async function cacheWiktionaryToc(
  word: string,
  edition: string,
  toc: WiktionaryToc,
  client: SourceCacheRedis | null = getRedis()
): Promise<void> {
  if (!client) return
  try {
    await client.set(wiktionaryTocKey(word, edition), toc, { ex: CONFIG.sourceCacheTTL })
  } catch (error) {
    console.error('[SourceCache] Wiktionary TOC write failed:', safeError(error))
  }
}
