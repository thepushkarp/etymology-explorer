import { after } from 'next/server'
import { canonicalizeWord, publisherTitle } from './orthography'
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
  mget?(...keys: string[]): Promise<(unknown | null)[]>
  set(
    key: string,
    value: SourceData | SourceRecord[] | WiktionaryToc,
    opts?: { ex?: number }
  ): Promise<unknown>
}

async function persistSourceWrite(useDeferred: boolean, write: () => Promise<void>): Promise<void> {
  if (!useDeferred) {
    await write()
    return
  }
  try {
    after(write)
  } catch {
    await write()
  }
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

const SOURCE_CACHE_PREFIX = 'src:v18:'

function sourceKey(source: CacheableSource, word: string, language: LanguageCode): string {
  const normalized = canonicalizeWord(word)
  if (source.startsWith('wiktionary'))
    return `src:v21:${source}:${language === 'en' ? '' : language + ':'}${publisherTitle(word)}`
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
  client?: SourceCacheRedis | null,
  language: LanguageCode = 'en'
): Promise<void> {
  const resolvedClient = client !== undefined ? client : getRedis()
  if (!resolvedClient || data.incomplete) return

  await persistSourceWrite(client === undefined, async () => {
    try {
      await resolvedClient.set(sourceKey(source, word, language), data, {
        ex: CONFIG.sourceCacheTTL,
      })
    } catch (error) {
      console.error(`[SourceCache] ${source} set error:`, safeError(error))
    }
  })
}

/** A provider request can return several independent dictionaries or homographs. */
function bundleKey(provider: string, word: string, lexicalLanguage: string): string {
  const prefix = provider === 'dle' ? 'src:v20:' : SOURCE_CACHE_PREFIX
  return `${prefix}bundle:${encodeURIComponent(provider)}:${encodeURIComponent(lexicalLanguage)}:${canonicalizeWord(word)}`
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
  client?: SourceCacheRedis | null
): Promise<void> {
  const resolvedClient = client !== undefined ? client : getRedis()
  if (!resolvedClient || records.length === 0 || records.some((record) => record.data.incomplete))
    return
  await persistSourceWrite(client === undefined, async () => {
    try {
      await resolvedClient.set(bundleKey(provider, word, lexicalLanguage), records, {
        ex: CONFIG.sourceCacheTTL,
      })
    } catch (error) {
      console.error(`[SourceCache] ${provider} bundle write failed:`, safeError(error))
    }
  })
}

/** Confirmed page headings, including empty lists for authoritative missing pages. */
export interface WiktionaryToc {
  headings: string[]
  nonemptyHeadings: string[]
  otherScripts?: ScriptTarget[]
}

function wiktionaryTocKey(word: string, edition: string): string {
  return `src:v20:wiktionaryToc:${edition === 'en' ? '' : `${edition}:`}${publisherTitle(word)}`
}

function parseWiktionaryToc(raw: unknown): WiktionaryToc | null {
  const maybe = raw as Partial<WiktionaryToc> | null
  return maybe &&
    Array.isArray(maybe.headings) &&
    Array.isArray(maybe.nonemptyHeadings) &&
    maybe.headings.every((heading) => typeof heading === 'string') &&
    maybe.nonemptyHeadings.every((heading) => typeof heading === 'string')
    ? {
        headings: maybe.headings,
        nonemptyHeadings: maybe.nonemptyHeadings,
        ...(maybe.otherScripts !== undefined
          ? { otherScripts: normalizeScriptTargets(maybe.otherScripts) }
          : {}),
      }
    : null
}

/** Batch-read a cached Wiktionary language section and its TOC in a single Redis RTT. */
export async function getCachedSourceAndToc(
  source: CacheableSource,
  word: string,
  edition: string,
  language: LanguageCode = 'en',
  client: SourceCacheRedis | null = getRedis()
): Promise<{ source: SourceData | null; toc: WiktionaryToc | null }> {
  if (!client) return { source: null, toc: null }
  const sKey = sourceKey(source, word, language)
  const tKey = wiktionaryTocKey(word, edition)
  try {
    if (typeof client.mget === 'function') {
      const [rawSource, rawToc] = await client.mget(sKey, tKey)
      return {
        source: isSourceData(rawSource) ? rawSource : null,
        toc: parseWiktionaryToc(rawToc),
      }
    }
    const [rawSource, rawToc] = await Promise.all([client.get(sKey), client.get(tKey)])
    return {
      source: isSourceData(rawSource) ? rawSource : null,
      toc: parseWiktionaryToc(rawToc),
    }
  } catch (error) {
    console.error(`[SourceCache] ${source} batch get error:`, safeError(error))
    return { source: null, toc: null }
  }
}

export async function getCachedWiktionaryToc(
  word: string,
  edition = 'en',
  client: SourceCacheRedis | null = getRedis()
): Promise<WiktionaryToc | null> {
  if (!client) return null
  try {
    return parseWiktionaryToc(await client.get(wiktionaryTocKey(word, edition)))
  } catch (error) {
    console.error('[SourceCache] Wiktionary TOC read failed:', safeError(error))
    return null
  }
}

export async function cacheWiktionaryToc(
  word: string,
  edition: string,
  toc: WiktionaryToc,
  client?: SourceCacheRedis | null
): Promise<void> {
  const resolvedClient = client !== undefined ? client : getRedis()
  if (!resolvedClient) return
  await persistSourceWrite(client === undefined, async () => {
    try {
      await resolvedClient.set(wiktionaryTocKey(word, edition), toc, { ex: CONFIG.sourceCacheTTL })
    } catch (error) {
      console.error('[SourceCache] Wiktionary TOC write failed:', safeError(error))
    }
  })
}
