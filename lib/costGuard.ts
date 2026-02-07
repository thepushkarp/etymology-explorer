/**
 * Global daily budget caps via atomic Redis INCR.
 * Prevents runaway costs from distributed abuse.
 *
 * Budget check is atomic: INCR first, then compare. If over budget,
 * the count is slightly inflated but never allows overspend under
 * concurrent load (no TOCTOU race).
 */

import { CONFIG } from './config'
import { getRedis } from './redis'

function todayKey(type: 'etymology' | 'pronunciation'): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return `${CONFIG.budgetPrefix}:${type}:${date}`
}

/**
 * Atomically reserve one etymology request against the daily budget.
 * Returns true if under limit or if Redis is unavailable (fail open).
 *
 * Uses INCR as the gate: the increment is the reservation, so concurrent
 * requests cannot overshoot the cap.
 */
export async function reserveEtymologyBudget(): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return true

  try {
    const key = todayKey('etymology')
    const count = await redis.incr(key)
    // Set TTL on first increment so keys auto-expire (25h covers timezone drift)
    if (count === 1) {
      await redis.expire(key, 25 * 60 * 60)
    }
    return count <= CONFIG.dailyBudget.etymology
  } catch (error) {
    console.error('[CostGuard] Etymology budget reserve failed:', error)
    return true // Fail open
  }
}

/**
 * Atomically reserve one pronunciation request against the daily budget.
 * Returns true if under limit or if Redis is unavailable (fail open).
 */
export async function reservePronunciationBudget(): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return true

  try {
    const key = todayKey('pronunciation')
    const count = await redis.incr(key)
    if (count === 1) {
      await redis.expire(key, 25 * 60 * 60)
    }
    return count <= CONFIG.dailyBudget.pronunciation
  } catch (error) {
    console.error('[CostGuard] Pronunciation budget reserve failed:', error)
    return true
  }
}

/**
 * Get current budget usage (for admin stats endpoint).
 */
export async function getBudgetStats(): Promise<{
  etymology: { used: number; limit: number }
  pronunciation: { used: number; limit: number }
} | null> {
  const redis = getRedis()
  if (!redis) return null

  try {
    const [etymCount, pronCount] = await Promise.all([
      redis.get<number>(todayKey('etymology')),
      redis.get<number>(todayKey('pronunciation')),
    ])
    return {
      etymology: { used: etymCount ?? 0, limit: CONFIG.dailyBudget.etymology },
      pronunciation: { used: pronCount ?? 0, limit: CONFIG.dailyBudget.pronunciation },
    }
  } catch (error) {
    console.error('[CostGuard] Stats fetch failed:', error)
    return null
  }
}
