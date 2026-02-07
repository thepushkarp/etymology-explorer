/**
 * Upstash Redis caching for etymology results.
 * Reduces API costs by caching LLM synthesis results.
 */

import { Redis } from '@upstash/redis'
import { EtymologyResult } from './types'
import { EtymologyResultSchema } from './schemas/etymology'
import { CONFIG } from './config'

const redis = new Redis({
  url: process.env.ETYMOLOGY_KV_REST_API_URL || '',
  token: process.env.ETYMOLOGY_KV_REST_API_TOKEN || '',
})

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
      return null // Treat as cache miss, will re-fetch from LLM
    }

    return parsed.data as EtymologyResult
  } catch (error) {
    console.error('[Cache] Etymology get error:', error)
    return null // Fail open - continue without cache
  }
}

/**
 * Cache etymology result for future lookups
 */
export async function cacheEtymology(word: string, result: EtymologyResult): Promise<void> {
  if (!isCacheConfigured()) return

  const key = `${ETYMOLOGY_PREFIX}${word.toLowerCase().trim()}`
  try {
    await redis.set(key, result, { ex: ETYMOLOGY_TTL })
    console.log(`[Cache] Stored etymology for "${word}"`)
  } catch (error) {
    console.error('[Cache] Etymology set error:', error)
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
    console.error('[Cache] Audio get error:', error)
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
    await redis.set(key, audioBase64, { ex: AUDIO_TTL })
    console.log(`[Cache] Stored audio for "${word}"`)
  } catch (error) {
    console.error('[Cache] Audio set error:', error)
  }
}
