/**
 * Global daily budget caps via Redis INCR.
 * Prevents runaway costs from distributed abuse.
 */

import { Redis } from '@upstash/redis'
import { CONFIG } from './config'

function getRedis(): Redis | null {
  if (!process.env.ETYMOLOGY_KV_REST_API_URL || !process.env.ETYMOLOGY_KV_REST_API_TOKEN) {
    return null
  }
  return new Redis({
    url: process.env.ETYMOLOGY_KV_REST_API_URL,
    token: process.env.ETYMOLOGY_KV_REST_API_TOKEN,
  })
}

function todayKey(type: 'etymology' | 'pronunciation'): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return `${CONFIG.budgetPrefix}:${type}:${date}`
}

/**
 * Check if etymology budget allows another request.
 * Returns true if under limit or if Redis is unavailable (fail open).
 */
export async function checkEtymologyBudget(): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return true

  try {
    const count = await redis.get<number>(todayKey('etymology'))
    return (count ?? 0) < CONFIG.dailyBudget.etymology
  } catch (error) {
    console.error('[CostGuard] Etymology budget check failed:', error)
    return true // Fail open
  }
}

/**
 * Increment etymology budget counter after a successful LLM call.
 */
export async function incrementEtymologyBudget(): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    const key = todayKey('etymology')
    await redis.incr(key)
    // Set TTL of 25 hours so keys auto-expire (covers timezone drift)
    await redis.expire(key, 25 * 60 * 60)
  } catch (error) {
    console.error('[CostGuard] Etymology budget increment failed:', error)
  }
}

/**
 * Check if pronunciation budget allows another request.
 * Returns true if under limit or if Redis is unavailable (fail open).
 */
export async function checkPronunciationBudget(): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return true

  try {
    const count = await redis.get<number>(todayKey('pronunciation'))
    return (count ?? 0) < CONFIG.dailyBudget.pronunciation
  } catch (error) {
    console.error('[CostGuard] Pronunciation budget check failed:', error)
    return true
  }
}

/**
 * Increment pronunciation budget counter after a successful TTS call.
 */
export async function incrementPronunciationBudget(): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    const key = todayKey('pronunciation')
    await redis.incr(key)
    await redis.expire(key, 25 * 60 * 60)
  } catch (error) {
    console.error('[CostGuard] Pronunciation budget increment failed:', error)
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
