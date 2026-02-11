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
import { safeError } from './errorUtils'
import { emitSecurityEvent } from './telemetry'
import type { ProtectionMode } from './types'

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
    console.error('[CostGuard] Etymology budget reserve failed:', safeError(error))
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
    console.error('[CostGuard] Pronunciation budget reserve failed:', safeError(error))
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
    console.error('[CostGuard] Stats fetch failed:', safeError(error))
    return null
  }
}

// --- USD-based cost tracking ---

export type CostMode = ProtectionMode

const {
  pricingPerMillionTokens: pricing,
  dailyLimitUSD,
  degradedAtPercent,
  cacheOnlyAtPercent,
} = CONFIG.costTracking

function costKey(): string {
  const date = new Date().toISOString().slice(0, 10)
  return `cost:usd:${date}`
}

/**
 * Record actual USD spend from token usage.
 * Uses INCRBYFLOAT for atomic accumulation. Sets 25h TTL on first call.
 */
export async function recordSpend(usage: {
  inputTokens: number
  outputTokens: number
}): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  const usd = (usage.inputTokens * pricing.input + usage.outputTokens * pricing.output) / 1_000_000

  try {
    const key = costKey()
    const result = await redis.incrbyfloat(key, usd)
    // First increment: result ≈ usd (within floating-point tolerance)
    if (Math.abs(result - usd) < 0.0001) {
      await redis.expire(key, 25 * 60 * 60)
    }
  } catch (error) {
    console.error('[CostGuard] recordSpend failed:', safeError(error))
  }
}

/**
 * Determine the current cost mode based on daily spend.
 * Fails open (returns 'normal' if Redis unavailable).
 */
export async function getCostMode(): Promise<CostMode> {
  const redis = getRedis()
  if (!redis) return 'normal'

  try {
    const raw = await redis.get<number>(costKey())
    const spent = raw ?? 0

    let mode: CostMode
    if (spent >= dailyLimitUSD) mode = 'blocked'
    else if (spent >= dailyLimitUSD * cacheOnlyAtPercent) mode = 'cache_only'
    else if (spent >= dailyLimitUSD * degradedAtPercent) mode = 'protected_503'
    else mode = 'normal'

    if (mode !== 'normal') {
      emitSecurityEvent({
        type: 'protection_mode_change',
        timestamp: Date.now(),
        detail: { mode, spentUSD: spent, limitUSD: dailyLimitUSD },
      })
    }

    return mode
  } catch (error) {
    console.error('[CostGuard] getCostMode failed:', safeError(error))
    return 'normal'
  }
}

/**
 * Get current spend stats for admin endpoint.
 */
export async function getSpendStats(): Promise<{
  spentUSD: number
  limitUSD: number
  mode: CostMode
} | null> {
  const redis = getRedis()
  if (!redis) return null

  try {
    const raw = await redis.get<number>(costKey())
    const spentUSD = raw ?? 0
    const mode = await getCostMode()
    return { spentUSD, limitUSD: dailyLimitUSD, mode }
  } catch (error) {
    console.error('[CostGuard] getSpendStats failed:', safeError(error))
    return null
  }
}
