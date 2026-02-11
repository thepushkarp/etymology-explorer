/**
 * Upstash Redis caching for etymology results.
 * Reduces API costs by caching LLM synthesis results.
 */

import { Redis } from '@upstash/redis'
import { EtymologyResult } from './types'
import { EtymologyResultSchema } from './schemas/etymology'
import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { emitSecurityEvent } from './telemetry'

const redis = new Redis({
  url: process.env.ETYMOLOGY_KV_REST_API_URL || '',
  token: process.env.ETYMOLOGY_KV_REST_API_TOKEN || '',
})

/** Apply ±jitter to a TTL to prevent synchronized cache stampedes */
function jitterTTL(ttl: number): number {
  const jitter = CONFIG.cache.ttlJitterPercent
  return Math.round(ttl * (1 + (Math.random() * 2 - 1) * jitter))
}

// Bump version when EtymologyResult schema changes
const CACHE_VERSION = 2
const ETYMOLOGY_PREFIX = `etymology:v${CACHE_VERSION}:`
const ETYMOLOGY_TTL = CONFIG.etymologyCacheTTL

// Audio cache (longer TTL - pronunciations don't change)
const AUDIO_PREFIX = `audio:v1:`
const AUDIO_TTL = CONFIG.audioCacheTTL

/**
 * Check if Redis caching is configured
 */
export function isCacheConfigured(): boolean {
  return !!(process.env.ETYMOLOGY_KV_REST_API_URL && process.env.ETYMOLOGY_KV_REST_API_TOKEN)
}

/**
 * Get cached etymology result
 * Returns null if not cached, invalid schema, or on error (fail open)
 * Uses Zod validation to detect schema mismatches from old cache entries
 */
export async function getCachedEtymology(word: string): Promise<EtymologyResult | null> {
  if (!isCacheConfigured()) return null

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
 * Cache etymology result for future lookups
 */
export async function cacheEtymology(word: string, result: EtymologyResult): Promise<void> {
  if (!isCacheConfigured()) return

  // Validate before writing to prevent caching invalid data
  const validated = EtymologyResultSchema.safeParse(result)
  if (!validated.success) {
    console.error(
      '[Cache] Refusing to cache invalid result for "%s":',
      word,
      validated.error.issues[0]?.message
    )
    emitSecurityEvent({
      type: 'schema_validation_fail',
      timestamp: Date.now(),
      detail: { word, source: 'cache_write', issue: validated.error.issues[0]?.message },
    })
    return
  }

  const key = `${ETYMOLOGY_PREFIX}${word.toLowerCase().trim()}`
  try {
    await redis.set(key, result, { ex: jitterTTL(ETYMOLOGY_TTL) })
    console.log(`[Cache] Stored etymology for "${word}"`)
  } catch (error) {
    console.error('[Cache] Etymology set error:', safeError(error))
    // Fail silently - result was already returned to user
  }
}

/**
 * Get cached audio (as base64 string)
 */
export async function getCachedAudio(word: string): Promise<string | null> {
  if (!isCacheConfigured()) return null

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
  if (!isCacheConfigured()) return

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
  if (!isCacheConfigured()) return false

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
  if (!isCacheConfigured()) return

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
