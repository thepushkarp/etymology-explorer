/**
 * Shared caching helpers for etymology, source fetches, and pronunciation audio.
 */

import { Redis } from '@upstash/redis'
import { CACHE_POLICY, buildWordKey } from '@/lib/config/guardrails'
import { EtymologyResult, SourceData } from '@/lib/types'
import { EtymologyResultSchema } from '@/lib/schemas/etymology'
import { getRedisClient, isRedisConfigured } from '@/lib/server/redis'

const memoryCache = new Map<string, { value: unknown; expiresAt: number }>()
let lastMemoryCleanupAt = 0

type SourceName = 'etymonline' | 'wiktionary' | 'wikipedia' | 'urban'

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function pruneMemoryCache(currentTime: number): void {
  const shouldCleanupForSize = memoryCache.size > CACHE_POLICY.memoryMaxEntries
  const shouldCleanupForTime =
    currentTime - lastMemoryCleanupAt >= CACHE_POLICY.memoryCleanupIntervalSeconds

  if (!shouldCleanupForSize && !shouldCleanupForTime) {
    return
  }

  lastMemoryCleanupAt = currentTime

  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt <= currentTime) {
      memoryCache.delete(key)
    }
  }

  while (memoryCache.size > CACHE_POLICY.memoryMaxEntries) {
    const oldestKey = memoryCache.keys().next().value as string | undefined
    if (!oldestKey) break
    memoryCache.delete(oldestKey)
  }
}

function getFromMemory<T>(key: string): T | null {
  const entry = memoryCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= nowSeconds()) {
    memoryCache.delete(key)
    return null
  }
  return entry.value as T
}

function setInMemory(key: string, value: unknown, ttlSeconds: number): void {
  const currentTime = nowSeconds()
  pruneMemoryCache(currentTime)

  memoryCache.set(key, {
    value,
    expiresAt: currentTime + ttlSeconds,
  })

  pruneMemoryCache(currentTime)
}

async function getValue<T>(redis: Redis | null, key: string): Promise<T | null> {
  if (redis) {
    return (await redis.get<T>(key)) || null
  }
  return getFromMemory<T>(key)
}

async function setValue(redis: Redis | null, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (redis) {
    await redis.set(key, value, { ex: ttlSeconds })
    return
  }
  setInMemory(key, value, ttlSeconds)
}

function etymologyKey(word: string, model: string): string {
  return `${CACHE_POLICY.keyPrefix}:etymology:${model}:${buildWordKey(word)}`
}

function negativeKey(word: string, model: string): string {
  return `${CACHE_POLICY.keyPrefix}:negative:${model}:${buildWordKey(word)}`
}

function lockKey(word: string, model: string): string {
  return `${CACHE_POLICY.keyPrefix}:lock:${model}:${buildWordKey(word)}`
}

function sourceKey(source: SourceName, word: string): string {
  return `${CACHE_POLICY.keyPrefix}:source:${source}:${buildWordKey(word)}`
}

function audioKey(word: string): string {
  return `${CACHE_POLICY.keyPrefix}:audio:${buildWordKey(word)}`
}

export function isCacheConfigured(): boolean {
  return isRedisConfigured()
}

export async function getCachedEtymology(word: string, model: string): Promise<EtymologyResult | null> {
  const redis = getRedisClient()
  const key = etymologyKey(word, model)

  try {
    const raw = await getValue<unknown>(redis, key)
    if (!raw) return null

    const parsed = EtymologyResultSchema.safeParse(raw)
    if (!parsed.success) {
      return null
    }

    return parsed.data as EtymologyResult
  } catch {
    return null
  }
}

export async function cacheEtymology(word: string, model: string, result: EtymologyResult): Promise<void> {
  try {
    const redis = getRedisClient()
    const key = etymologyKey(word, model)
    await setValue(redis, key, result, CACHE_POLICY.etymologyTtlSeconds)
  } catch {
    // Cache write failures should not fail request handling.
  }
}

export async function getNegativeCache(word: string, model: string): Promise<boolean> {
  try {
    const redis = getRedisClient()
    const key = negativeKey(word, model)
    const value = await getValue<string>(redis, key)
    return value === '1'
  } catch {
    return false
  }
}

export async function cacheNegative(word: string, model: string): Promise<void> {
  try {
    const redis = getRedisClient()
    const key = negativeKey(word, model)
    await setValue(redis, key, '1', CACHE_POLICY.negativeTtlSeconds)
  } catch {
    // Negative cache write failures are non-fatal.
  }
}

export async function acquireSingleflightLock(
  word: string,
  model: string,
  owner: string
): Promise<boolean> {
  try {
    const redis = getRedisClient()
    const key = lockKey(word, model)

    if (redis) {
      const result = await redis.set(key, owner, {
        nx: true,
        ex: CACHE_POLICY.singleflightLockTtlSeconds,
      })
      return result === 'OK'
    }

    const existing = getFromMemory<string>(key)
    if (existing) {
      return false
    }

    setInMemory(key, owner, CACHE_POLICY.singleflightLockTtlSeconds)
    return true
  } catch {
    // Fail-open on lock acquisition issues to avoid total outage.
    return true
  }
}

export async function releaseSingleflightLock(word: string, model: string): Promise<void> {
  try {
    const redis = getRedisClient()
    const key = lockKey(word, model)

    if (redis) {
      await redis.del(key)
      return
    }

    memoryCache.delete(key)
  } catch {
    // Lock release failures should not bubble up.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForCachedEtymology(word: string, model: string): Promise<EtymologyResult | null> {
  for (let i = 0; i < CACHE_POLICY.singleflightPollCount; i += 1) {
    const cached = await getCachedEtymology(word, model)
    if (cached) {
      return cached
    }
    await sleep(CACHE_POLICY.singleflightPollDelayMs)
  }

  return null
}

export async function getCachedSource(source: SourceName, word: string): Promise<SourceData | null> {
  try {
    const redis = getRedisClient()
    const key = sourceKey(source, word)
    return await getValue<SourceData>(redis, key)
  } catch {
    return null
  }
}

export async function cacheSource(source: SourceName, word: string, data: SourceData): Promise<void> {
  try {
    const redis = getRedisClient()
    const key = sourceKey(source, word)
    await setValue(redis, key, data, CACHE_POLICY.sourceTtlSeconds)
  } catch {
    // Source cache write failures are non-fatal.
  }
}

export async function getCachedAudio(word: string): Promise<string | null> {
  try {
    const redis = getRedisClient()
    const key = audioKey(word)
    return await getValue<string>(redis, key)
  } catch {
    return null
  }
}

export async function cacheAudio(word: string, audioBase64: string): Promise<void> {
  try {
    const redis = getRedisClient()
    const key = audioKey(word)
    await setValue(redis, key, audioBase64, CACHE_POLICY.audioTtlSeconds)
  } catch {
    // Audio cache write failures are non-fatal.
  }
}
