/**
 * Redis cache for raw etymonline/wiktionary page data.
 * Repeated cache-misses for the final result (and root/related lookups that
 * overlap across words) should not re-scrape the same source pages.
 * Fails open: no Redis, or any Redis error, means a normal live fetch.
 */

import { CONFIG } from './config'
import { getRedis } from './redis'
import { safeError } from './errorUtils'
import type { SourceData } from './types'
import type { LanguageCode } from './languages'

/**
 * Minimal Redis surface used by this module (allows in-memory test doubles).
 * Objects are passed through as-is: @upstash/redis serializes on write and
 * deserializes on read.
 */
export interface SourceCacheRedis {
  get(key: string): Promise<unknown>
  set(key: string, value: SourceData, opts?: { ex?: number }): Promise<unknown>
}

export type CacheableSource =
  | 'etymonline'
  | 'wiktionary'
  | 'wiktionaryEnglish'
  | 'wiktionaryNative'
  | 'wikidataLexeme'
  | 'multilingualDictionary'
  | 'dicionarioAberto'

const SOURCE_CACHE_PREFIX = 'src:v1:'

function sourceKey(source: CacheableSource, word: string, language: LanguageCode): string {
  const normalized = word.toLowerCase().trim()
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
  if (!client) return

  try {
    await client.set(sourceKey(source, word, language), data, { ex: CONFIG.sourceCacheTTL })
  } catch (error) {
    console.error(`[SourceCache] ${source} set error:`, safeError(error))
  }
}
