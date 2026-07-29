/**
 * Upstash Redis caching for etymology results.
 * Reduces API costs by caching LLM synthesis results.
 */

import { revalidateTag } from 'next/cache'
import { after } from 'next/server'
import { EtymologyResult } from './types'
import { CachedEtymologyResultSchema } from './schemas/etymology'
import { CONFIG } from './config'
import { getRedis } from './redis'
import { safeError } from './errorUtils'
import { emitSecurityEvent } from './telemetry'
import type { LanguageCode } from './languages'
import { isBetaLanguage, lexemeKey, parseLanguageCode } from './languages'

/** Apply ±jitter to a TTL to prevent synchronized cache stampedes */
function jitterTTL(ttl: number): number {
  const jitter = CONFIG.cache.ttlJitterPercent
  return Math.round(ttl * (1 + (Math.random() * 2 - 1) * jitter))
}

// Bump version when EtymologyResult schema or sourcing behavior changes
export const CACHE_VERSION = '2.2'
export const ETYMOLOGY_PREFIX = `etymology:v${CACHE_VERSION}:`
export const BETA_CACHE_VERSION = '5'
export const BETA_ETYMOLOGY_PREFIX = `etymology:beta:v${BETA_CACHE_VERSION}:`
export const ETYMOLOGY_SCAN_PATTERN = 'etymology:*'
const ETYMOLOGY_TTL = CONFIG.etymologyCacheTTL

// Audio cache (longer TTL - pronunciations don't change)
const AUDIO_PREFIX = `audio:v1:`
const AUDIO_TTL = CONFIG.audioCacheTTL

/**
 * Check if Redis caching is configured
 */
export function isCacheConfigured(): boolean {
  return getRedis() !== null
}

/**
 * Get cached etymology result
 * Returns null if not cached, invalid schema, or on error (fail open)
 * Uses Zod validation to detect schema mismatches from old cache entries
 */
function etymologyKey(word: string, language: LanguageCode): string {
  const normalized = word.toLowerCase().trim()
  return language === 'en'
    ? `${ETYMOLOGY_PREFIX}${normalized}`
    : `${BETA_ETYMOLOGY_PREFIX}${language}:${normalized}`
}

export function lexemeFromEtymologyCacheKey(
  key: string
): { language: LanguageCode; word: string } | null {
  if (key.startsWith(BETA_ETYMOLOGY_PREFIX)) {
    const suffix = key.slice(BETA_ETYMOLOGY_PREFIX.length)
    const separator = suffix.indexOf(':')
    if (separator <= 0) return null

    const language = parseLanguageCode(suffix.slice(0, separator))
    if (!language || !isBetaLanguage(language)) return null
    return { language, word: suffix.slice(separator + 1) }
  }

  if (key.startsWith(ETYMOLOGY_PREFIX)) {
    return { language: 'en', word: key.slice(ETYMOLOGY_PREFIX.length) }
  }

  return null
}

export function etymologyWordTag(word: string, language: LanguageCode = 'en'): string {
  const normalized = word.toLowerCase().trim()
  return language === 'en'
    ? `etymology-word:${normalized}`
    : `etymology-word:${lexemeKey(language, normalized)}`
}

export async function getCachedEtymology(
  word: string,
  language: LanguageCode = 'en'
): Promise<EtymologyResult | null> {
  const redis = getRedis()
  if (!redis) return null

  const key = etymologyKey(word, language)
  try {
    const raw = await redis.get(key)
    if (!raw) return null

    // Validate against current schema - treats invalid data as cache miss
    const parsed = CachedEtymologyResultSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn(
        `[Cache] Schema mismatch for "${word}":`,
        parsed.error.issues[0]?.message || 'Unknown validation error'
      )
      emitSecurityEvent({
        type: 'schema_validation_fail',
        timestamp: Date.now(),
        detail: { word, source: 'cache_read', issue: parsed.error.issues[0]?.message },
      })
      return null // Treat as cache miss, will re-fetch from LLM
    }

    const result = parsed.data as EtymologyResult
    const resultLanguage = result.language ?? 'en'
    if (resultLanguage !== language) {
      console.warn(
        `[Cache] Language mismatch for "${word}": requested ${language}, cached ${resultLanguage}`
      )
      return null
    }
    return result.language ? result : { ...result, language: 'en' }
  } catch (error) {
    console.error('[Cache] Etymology get error:', safeError(error))
    return null // Fail open - continue without cache
  }
}

/**
 * Cache etymology result for future lookups.
 * No write-side schema validation: every result passing through here was
 * already validated by finalizeResult in lib/llm.ts, and reads re-validate
 * for forward compatibility.
 */
export async function cacheEtymology(
  word: string,
  result: EtymologyResult,
  language: LanguageCode = result.language ?? 'en'
): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  const normalized = word.toLowerCase().trim()
  const key = etymologyKey(normalized, language)
  try {
    await redis.set(key, result, { ex: jitterTTL(ETYMOLOGY_TTL) })
    console.log(`[Cache] Stored etymology for "${word}"`)
  } catch (error) {
    console.error('[Cache] Etymology set error:', safeError(error))
    // Fail silently - result was already returned to user
    return
  }

  // A freshly traced word must surface on /word/{word} immediately: purge
  // the page's tagged data cache (tag planted by app/word/[word]/page.tsx)
  // so the ISR miss page doesn't outlive the trace.
  //
  // Two subtleties, both verified against next@16 internals:
  // - Streaming: pending tag revalidations are flushed when the route
  //   handler RETURNS its Response — before a streaming body runs this
  //   code. after() re-flushes new revalidations once the response
  //   finishes (withExecuteRevalidates), so the purge lands on both the
  //   streaming and unary paths.
  // - { expire: 0 } hard-expires the tag. The 'max' profile would only
  //   mark it stale-while-revalidate, letting the very next load still
  //   serve the miss page.
  //
  // Best-effort — outside a Next request scope (tests, scripts) after()
  // throws and the page refreshes on its hourly data-cache window instead.
  try {
    after(() => {
      revalidateTag(etymologyWordTag(normalized, language), { expire: 0 })
    })
  } catch (error) {
    console.warn('[Cache] Word page revalidation skipped:', safeError(error))
  }
}

/**
 * Get cached audio (as base64 string)
 */
export async function getCachedAudio(
  word: string,
  language: LanguageCode = 'en'
): Promise<string | null> {
  const redis = getRedis()
  if (!redis) return null

  const key = audioKey(word, language)
  try {
    return await redis.get<string>(key)
  } catch (error) {
    console.error('[Cache] Audio get error:', safeError(error))
    return null
  }
}

/**
 * Cache audio (as base64 string)
 */
export async function cacheAudio(
  word: string,
  audioBase64: string,
  language: LanguageCode = 'en'
): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  const key = audioKey(word, language)
  try {
    await redis.set(key, audioBase64, { ex: jitterTTL(AUDIO_TTL) })
    console.log(`[Cache] Stored audio for "${word}"`)
  } catch (error) {
    console.error('[Cache] Audio set error:', safeError(error))
  }
}

function audioKey(word: string, language: LanguageCode): string {
  const normalized = word.normalize('NFKC').trim().toLowerCase()
  // Preserve the established English namespace; only beta languages need a
  // qualifier to prevent same-spelling pronunciations from colliding.
  return language === 'en'
    ? `${AUDIO_PREFIX}${normalized}`
    : `${AUDIO_PREFIX}${lexemeKey(language, normalized)}`
}

/**
 * Check if a word is in the negative cache (known invalid/no-source words).
 * Returns false on error (fail open).
 */
export async function getNegativeCache(
  word: string,
  language: LanguageCode = 'en'
): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false

  const normalized = word.toLowerCase().trim()
  const key =
    language === 'en' ? `neg:v2:${normalized}` : `neg:v2:${lexemeKey(language, normalized)}`
  try {
    const exists = await redis.exists(key)
    return exists === 1
  } catch (error) {
    console.error('[Cache] Negative cache get error:', safeError(error))
    return false
  }
}

/**
 * Mark a word in the negative cache to prevent repeated no-source fetches.
 * Only caches specific error types — transient errors should NOT be cached.
 * Fails silently.
 */
export async function cacheNegative(
  word: string,
  errorType: string,
  language: LanguageCode = 'en'
): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  if (!CONFIG.cache.negativeCacheAdmitOnly.includes(errorType)) {
    return
  }

  const normalized = word.toLowerCase().trim()
  const key =
    language === 'en' ? `neg:v2:${normalized}` : `neg:v2:${lexemeKey(language, normalized)}`
  try {
    await redis.set(key, '1', { ex: jitterTTL(CONFIG.negativeCacheTTL) })
  } catch (error) {
    console.error('[Cache] Negative cache set error:', safeError(error))
  }
}
