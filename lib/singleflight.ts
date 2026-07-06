/**
 * Singleflight deduplication using Redis distributed locks.
 * Prevents N concurrent requests for the same uncached word
 * from triggering N parallel LLM calls.
 *
 * Design: owner-token lock (SET NX with a random token as the value).
 * The pipeline can run for minutes, so the holder heartbeats EXPIRE
 * while working and releases the lock only if it still owns it. The
 * result is written to cache BEFORE release so waiters always find it.
 *
 * Release and heartbeat use GET-then-DEL/EXPIRE rather than a Lua
 * script. This leaves a small race: if the lock expired mid-operation
 * and another request acquired it between our GET and DEL, we would
 * delete the new holder's lock. The window is milliseconds and the
 * worst case is one duplicate LLM call (~$0.02), which we accept in
 * exchange for a simple, mockable implementation.
 */

import { randomUUID } from 'crypto'
import { getRedis } from './redis'
import { CONFIG } from './config'
import { safeError } from './errorUtils'

/** Minimal Redis surface used by this module (allows in-memory test doubles). */
export interface SingleflightRedis {
  set(key: string, value: string, opts: { nx: true; ex: number }): Promise<unknown>
  get(key: string): Promise<unknown>
  del(key: string): Promise<unknown>
  exists(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
}

export type LockAcquisition =
  | { status: 'acquired'; token: string }
  | { status: 'busy' }
  | { status: 'unavailable' } // Redis not configured
  | { status: 'error' } // Redis errored

/**
 * Try to acquire a distributed lock for a cache key.
 * The caller decides the failure policy for 'unavailable' and 'error':
 * etymology fails closed (503), pronunciation proceeds without a lock.
 */
export async function tryAcquireLock(
  lockKey: string,
  client: SingleflightRedis | null = getRedis()
): Promise<LockAcquisition> {
  if (!client) return { status: 'unavailable' }

  const token = randomUUID()
  try {
    const result = await client.set(lockKey, token, {
      nx: true,
      ex: CONFIG.singleflight.lockTTLSeconds,
    })
    return result === 'OK' ? { status: 'acquired', token } : { status: 'busy' }
  } catch (error) {
    console.error('[Singleflight] Lock acquisition failed:', safeError(error))
    return { status: 'error' }
  }
}

/**
 * Release a previously acquired lock, but only if we still own it
 * (prevents deleting a lock another request acquired after ours expired).
 */
export async function releaseLock(
  lockKey: string,
  token: string,
  client: SingleflightRedis | null = getRedis()
): Promise<void> {
  if (!client) return

  try {
    const current = await client.get(lockKey)
    if (current === token) {
      await client.del(lockKey)
    }
  } catch {
    // Lock will auto-expire via TTL — safe to ignore
  }
}

/**
 * Keep a held lock alive while long pipeline work runs.
 * Re-EXPIREs the lock every heartbeat interval as long as we still own it.
 * Returns a stop function — call it in `finally` when the work ends.
 */
export function startLockHeartbeat(
  lockKey: string,
  token: string,
  options?: { intervalMs?: number; ttlSeconds?: number; client?: SingleflightRedis | null }
): () => void {
  const client = options?.client !== undefined ? options.client : getRedis()
  if (!client) return () => {}

  const intervalMs = options?.intervalMs ?? CONFIG.singleflight.heartbeatIntervalMs
  const ttlSeconds = options?.ttlSeconds ?? CONFIG.singleflight.lockTTLSeconds

  const timer = setInterval(() => {
    void (async () => {
      try {
        const current = await client.get(lockKey)
        if (current === token) {
          await client.expire(lockKey, ttlSeconds)
        }
      } catch (error) {
        console.error('[Singleflight] Heartbeat failed:', safeError(error))
      }
    })()
  }, intervalMs)

  return () => clearInterval(timer)
}

/**
 * Check whether the lock key still exists. Waiters use this to detect a
 * crashed holder (lock gone, no cached result) and promote themselves.
 * On Redis errors, reports the lock as held so waiters keep polling
 * instead of stampeding into promotion.
 */
export async function isLockHeld(
  lockKey: string,
  client: SingleflightRedis | null = getRedis()
): Promise<boolean> {
  if (!client) return false

  try {
    return (await client.exists(lockKey)) === 1
  } catch {
    return true
  }
}

/**
 * Poll for a cached result to appear (set by the lock holder).
 * Returns the result if found within the poll window, or null on timeout.
 */
export async function pollForResult<T>(
  getCached: () => Promise<T | null>,
  options?: { intervalMs?: number; maxWaitMs?: number }
): Promise<T | null> {
  const intervalMs = options?.intervalMs ?? CONFIG.singleflight.waiterPollIntervalMs
  const maxWaitMs = options?.maxWaitMs ?? CONFIG.singleflight.unaryWaiterMaxWaitMs

  const startedAt = Date.now()
  while (Date.now() - startedAt < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    const result = await getCached()
    if (result !== null) return result
  }

  return null
}
