/**
 * Upstash Redis caching for etymology results.
 * Reduces API costs by caching LLM synthesis results.
 */

import { revalidateTag } from 'next/cache'
import { EtymologyResult } from './types'
import { EtymologyResultSchema } from './schemas/etymology'
import { CONFIG } from './config'
import { getRedis } from './redis'
import { safeError } from './errorUtils'
import { emitSecurityEvent } from './telemetry'

/** Apply ±jitter to a TTL to prevent synchronized cache stampedes */
function jitterTTL(ttl: number): number {
  const jitter = CONFIG.cache.ttlJitterPercent
  return Math.round(ttl * (1 + (Math.random() * 2 - 1) * jitter))
}

// Bump version when EtymologyResult schema or sourcing behavior changes
export const CACHE_VERSION = '2.2'
export const ETYMOLOGY_PREFIX = `etymology:v${CACHE_VERSION}:`
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
export async function getCachedEtymology(word: string): Promise<EtymologyResult | null> {
  const redis = getRedis()
  if (!redis) return null

  const key = `${ETYMOLOGY_PREFIX}${word.toLowerCase().trim()}`
  try {
    const raw = await redis.get(key)
    if (!raw) return null

    // Validate against current schema - treats invalid data as cache miss
    const parsed = EtymologyResultSchema.safeParse(raw)
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

    return parsed.data as EtymologyResult
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
export async function cacheEtymology(word: string, result: EtymologyResult): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  const normalized = word.toLowerCase().trim()
  const key = `${ETYMOLOGY_PREFIX}${normalized}`
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
  // so the ISR miss page doesn't outlive the trace. Best-effort — outside a
  // Next request scope (tests, scripts) revalidateTag throws and the page
  // simply refreshes on its hourly data-cache window instead.
  try {
    revalidateTag(`etymology-word:${normalized}`, 'max')
  } catch (error) {
    console.warn('[Cache] Word page revalidation skipped:', safeError(error))
  }
}

/**
 * Get cached audio (as base64 string)
 */
export async function getCachedAudio(word: string): Promise<string | null> {
  const redis = getRedis()
  if (!redis) return null

  const key = `${AUDIO_PREFIX}${word.toLowerCase().trim()}`
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
export async function cacheAudio(word: string, audioBase64: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  const key = `${AUDIO_PREFIX}${word.toLowerCase().trim()}`
  try {
    await redis.set(key, audioBase64, { ex: jitterTTL(AUDIO_TTL) })
    console.log(`[Cache] Stored audio for "${word}"`)
  } catch (error) {
    console.error('[Cache] Audio set error:', safeError(error))
  }
}

/**
 * Check if a word is in the negative cache (known bad/gibberish words).
 * Returns false on error (fail open).
 */
export async function getNegativeCache(word: string): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false

  const key = `neg:v1:${word.toLowerCase().trim()}`
  try {
    const exists = await redis.exists(key)
    return exists === 1
  } catch (error) {
    console.error('[Cache] Negative cache get error:', safeError(error))
    return false
  }
}

/**
 * Mark a word in the negative cache to prevent repeated fetches for gibberish.
 * Only caches specific error types — transient errors should NOT be cached.
 * Fails silently.
 */
export async function cacheNegative(word: string, errorType: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  if (!CONFIG.cache.negativeCacheAdmitOnly.includes(errorType)) {
    return
  }

  const key = `neg:v1:${word.toLowerCase().trim()}`
  try {
    await redis.set(key, '1', { ex: jitterTTL(CONFIG.negativeCacheTTL) })
  } catch (error) {
    console.error('[Cache] Negative cache set error:', safeError(error))
  }
}
