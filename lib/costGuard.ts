import { CONFIG } from './config'
import { getRedis } from './redis'
import { safeError } from './errorUtils'
import { emitSecurityEvent } from './telemetry'
import type { LlmUsage, ProtectionMode } from './types'

export type CostMode = ProtectionMode

/** Minimal Redis surface used by this module (allows in-memory test doubles). */
export interface CostGuardRedis {
  get(key: string): Promise<unknown>
  pipeline(): CostGuardPipeline
}

export interface CostGuardPipeline {
  incrbyfloat(key: string, value: number): CostGuardPipeline
  expire(key: string, seconds: number, option: 'nx'): CostGuardPipeline
  exec(): Promise<unknown>
}

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

/** Prefer the OpenRouter-reported USD cost; fall back to config pricing math. */
export function usageToUSD(usage: LlmUsage): number {
  if (usage.costUSD !== undefined) return usage.costUSD
  return (usage.inputTokens * pricing.input + usage.outputTokens * pricing.output) / 1_000_000
}

function parseSpend(raw: unknown): number {
  const spent = Number(raw ?? 0)
  return Number.isFinite(spent) ? spent : 0
}

/**
 * Record LLM spend against the monthly budget.
 * INCRBYFLOAT and EXPIRE NX run in one pipeline: NX sets the TTL only when
 * the key has none, so every increment repairs a missing TTL (no brittle
 * first-increment detection) without ever extending an existing one.
 */
export async function recordSpend(
  usage: LlmUsage,
  client: CostGuardRedis | null = getRedis()
): Promise<void> {
  if (!client) return

  const usd = usageToUSD(usage)
  if (usd <= 0) return

  try {
    const pipeline = client.pipeline()
    pipeline.incrbyfloat(costKey(), usd)
    pipeline.expire(costKey(), secondsUntilNextMonth(), 'nx')
    await pipeline.exec()
  } catch (error) {
    console.error('[CostGuard] recordSpend failed:', safeError(error))
  }
}

export async function getCostMode(client: CostGuardRedis | null = getRedis()): Promise<CostMode> {
  if (!client) return 'normal'

  try {
    const spent = parseSpend(await client.get(costKey()))

    const mode: CostMode = spent >= monthlyLimitUSD * cacheOnlyAtPercent ? 'cache_only' : 'normal'

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

export async function getSpendStats(client: CostGuardRedis | null = getRedis()): Promise<{
  spentUSD: number
  limitUSD: number
  mode: CostMode
  period: string
} | null> {
  if (!client) return null

  try {
    const spentUSD = parseSpend(await client.get(costKey()))
    const mode = await getCostMode(client)
    return { spentUSD, limitUSD: monthlyLimitUSD, mode, period: currentMonth() }
  } catch (error) {
    console.error('[CostGuard] getSpendStats failed:', safeError(error))
    return null
  }
}
