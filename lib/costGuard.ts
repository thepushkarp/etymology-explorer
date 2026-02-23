import { CONFIG } from './config'
import { getRedis } from './redis'
import { safeError } from './errorUtils'
import { emitSecurityEvent } from './telemetry'
import type { ProtectionMode } from './types'

export type CostMode = ProtectionMode

const {
  pricingPerMillionTokens: pricing,
  monthlyLimitUSD,
  cacheOnlyAtPercent,
} = CONFIG.costTracking

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function costKey(): string {
  return `cost:usd:${currentMonth()}`
}

function secondsUntilNextMonth(now = new Date()): number {
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0))
  const windowSeconds = Math.ceil((nextMonth.getTime() - now.getTime()) / 1000)
  const safetyBufferSeconds = 48 * 60 * 60
  return Math.max(60, windowSeconds + safetyBufferSeconds)
}

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
      await redis.expire(key, secondsUntilNextMonth())
    }
  } catch (error) {
    console.error('[CostGuard] recordSpend failed:', safeError(error))
  }
}

export async function getCostMode(): Promise<CostMode> {
  const redis = getRedis()
  if (!redis) return 'normal'

  try {
    const raw = await redis.get<number>(costKey())
    const spent = raw ?? 0

    let mode: CostMode
    if (spent >= monthlyLimitUSD) mode = 'blocked'
    else if (spent >= monthlyLimitUSD * cacheOnlyAtPercent) mode = 'cache_only'
    else if (spent >= monthlyLimitUSD * CONFIG.protection.protected503AtPercent)
      mode = 'protected_503'
    else mode = 'normal'

    if (mode !== 'normal') {
      emitSecurityEvent({
        type: 'protection_mode_change',
        timestamp: Date.now(),
        detail: { mode, spentUSD: spent, limitUSD: monthlyLimitUSD, period: currentMonth() },
      })
    }

    return mode
  } catch (error) {
    console.error('[CostGuard] getCostMode failed:', safeError(error))
    return 'normal'
  }
}

export async function getSpendStats(): Promise<{
  spentUSD: number
  limitUSD: number
  mode: CostMode
  period: string
} | null> {
  const redis = getRedis()
  if (!redis) return null

  try {
    const raw = await redis.get<number>(costKey())
    const spentUSD = raw ?? 0
    const mode = await getCostMode()
    return { spentUSD, limitUSD: monthlyLimitUSD, mode, period: currentMonth() }
  } catch (error) {
    console.error('[CostGuard] getSpendStats failed:', safeError(error))
    return null
  }
}
