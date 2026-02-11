/**
 * Singleflight deduplication using Redis distributed locks.
 * Prevents N concurrent requests for the same uncached word
 * from triggering N parallel LLM calls.
 *
 * Pattern: first request acquires lock and does the work,
 * subsequent requests poll for the cached result.
 */

import { getRedis } from './redis'
import { CONFIG } from './config'

/**
 * Try to acquire a distributed lock for a cache key.
 * Returns true if lock acquired (caller should do the work).
 * Returns false if another request holds the lock (caller should poll).
 * Fails open if Redis unavailable.
 */
export async function tryAcquireLock(lockKey: string): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return true // No Redis = no coordination, do the work

  try {
    // SET NX with EX: only sets if key doesn't exist, auto-expires
    const result = await redis.set(lockKey, '1', {
      nx: true,
      ex: CONFIG.singleflight.lockTTL,
    })
    return result === 'OK'
  } catch {
    return true // Fail open — do the work rather than deadlock
  }
}

/**
 * Release a previously acquired lock.
 */
export async function releaseLock(lockKey: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    await redis.del(lockKey)
  } catch {
    // Lock will auto-expire via TTL — safe to ignore
  }
}

/**
 * Poll for a cached result to appear (set by the lock holder).
 * Returns the result if found within the poll window, or null on timeout.
 */
export async function pollForResult<T>(getCached: () => Promise<T | null>): Promise<T | null> {
  const { pollIntervalMs, maxPolls } = CONFIG.singleflight

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    const result = await getCached()
    if (result !== null) return result
  }

  return null
}
