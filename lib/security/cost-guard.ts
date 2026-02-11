import { COST_POLICY, CostMode } from '@/lib/config/guardrails'
import { getRedisClient } from '@/lib/server/redis'

export type DailyBudgetRoute = 'etymology' | 'pronunciation'

interface MemorySpend {
  day: number
  month: number
  dayStamp: string
  monthStamp: string
}

interface MemoryDailyRequestUsage {
  dayStamp: string
  counts: Record<DailyBudgetRoute, number>
}

const memorySpend: MemorySpend = {
  day: 0,
  month: 0,
  dayStamp: '',
  monthStamp: '',
}

const memoryDailyRequestUsage: MemoryDailyRequestUsage = {
  dayStamp: '',
  counts: {
    etymology: 0,
    pronunciation: 0,
  },
}

const DAILY_BUDGET_ROUTES: readonly DailyBudgetRoute[] = ['etymology', 'pronunciation']

const RESERVE_DAILY_REQUEST_BUDGET_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttlSeconds = tonumber(ARGV[2])

local used = redis.call("INCR", key)

if used == 1 then
  redis.call("EXPIRE", key, ttlSeconds)
end

if used > limit then
  redis.call("DECR", key)
  local rolledBack = redis.call("GET", key)
  return {0, tonumber(rolledBack) or 0}
end

return {1, used}
`

const RECORD_SPEND_SCRIPT = `
local dayKey = KEYS[1]
local monthKey = KEYS[2]
local usd = tonumber(ARGV[1])
local dayTtlSeconds = tonumber(ARGV[2])
local monthTtlSeconds = tonumber(ARGV[3])

redis.call("INCRBYFLOAT", dayKey, usd)
if redis.call("TTL", dayKey) < 0 then
  redis.call("EXPIRE", dayKey, dayTtlSeconds)
end

redis.call("INCRBYFLOAT", monthKey, usd)
if redis.call("TTL", monthKey) < 0 then
  redis.call("EXPIRE", monthKey, monthTtlSeconds)
end

return 1
`

function getDayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function getMonthStamp(): string {
  return new Date().toISOString().slice(0, 7)
}

function syncMemorySpendStamps(dayStamp: string, monthStamp: string): void {
  if (memorySpend.dayStamp !== dayStamp) {
    memorySpend.dayStamp = dayStamp
    memorySpend.day = 0
  }

  if (memorySpend.monthStamp !== monthStamp) {
    memorySpend.monthStamp = monthStamp
    memorySpend.month = 0
  }
}

function syncMemoryDailyUsageStamp(dayStamp: string): void {
  if (memoryDailyRequestUsage.dayStamp === dayStamp) {
    return
  }

  memoryDailyRequestUsage.dayStamp = dayStamp
  memoryDailyRequestUsage.counts.etymology = 0
  memoryDailyRequestUsage.counts.pronunciation = 0
}

function getDailyBudgetLimit(route: DailyBudgetRoute): number {
  return COST_POLICY.dailyRequestBudget[route]
}

function getDailyBudgetKey(route: DailyBudgetRoute, dayStamp: string): string {
  return `${COST_POLICY.keyPrefix}:daily_request:${route}:${dayStamp}`
}

function reserveDailyRequestBudgetInMemory(
  route: DailyBudgetRoute,
  dayStamp: string
): { allowed: boolean; used: number; limit: number } {
  syncMemoryDailyUsageStamp(dayStamp)

  const limit = getDailyBudgetLimit(route)
  const used = memoryDailyRequestUsage.counts[route]

  if (used >= limit) {
    return { allowed: false, used, limit }
  }

  const nextUsed = used + 1
  memoryDailyRequestUsage.counts[route] = nextUsed
  return { allowed: true, used: nextUsed, limit }
}

export async function reserveDailyRequestBudget(
  route: DailyBudgetRoute
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const dayStamp = getDayStamp()
  const limit = getDailyBudgetLimit(route)
  const redis = getRedisClient()

  if (!redis) {
    return reserveDailyRequestBudgetInMemory(route, dayStamp)
  }

  try {
    const key = getDailyBudgetKey(route, dayStamp)
    const reserveScript = redis.createScript<[number, number]>(RESERVE_DAILY_REQUEST_BUDGET_SCRIPT)
    const [allowedRaw, usedRaw] = await reserveScript.exec(
      [key],
      [String(limit), String(COST_POLICY.dailyRequestBudgetTtlSeconds)]
    )

    return {
      allowed: Number(allowedRaw) === 1,
      used: Number(usedRaw || 0),
      limit,
    }
  } catch {
    return reserveDailyRequestBudgetInMemory(route, dayStamp)
  }
}

export async function getTodayDailyRequestBudgetUsageCounts(): Promise<Record<DailyBudgetRoute, number>> {
  const dayStamp = getDayStamp()
  const redis = getRedisClient()
  const [etymologyRoute, pronunciationRoute] = DAILY_BUDGET_ROUTES

  if (!redis) {
    syncMemoryDailyUsageStamp(dayStamp)
    return { ...memoryDailyRequestUsage.counts }
  }

  try {
    const [etymologyUsed, pronunciationUsed] = await Promise.all([
      redis.get<number>(getDailyBudgetKey(etymologyRoute, dayStamp)),
      redis.get<number>(getDailyBudgetKey(pronunciationRoute, dayStamp)),
    ])

    return {
      etymology: Number(etymologyUsed || 0),
      pronunciation: Number(pronunciationUsed || 0),
    }
  } catch {
    syncMemoryDailyUsageStamp(dayStamp)
    return { ...memoryDailyRequestUsage.counts }
  }
}

async function readSpend(): Promise<{ dayUsd: number; monthUsd: number }> {
  const dayStamp = getDayStamp()
  const monthStamp = getMonthStamp()
  const redis = getRedisClient()

  if (!redis) {
    syncMemorySpendStamps(dayStamp, monthStamp)
    return {
      dayUsd: memorySpend.day,
      monthUsd: memorySpend.month,
    }
  }

  try {
    const [dayValue, monthValue] = await Promise.all([
      redis.get<number>(`${COST_POLICY.keyPrefix}:day:${dayStamp}`),
      redis.get<number>(`${COST_POLICY.keyPrefix}:month:${monthStamp}`),
    ])

    return {
      dayUsd: Number(dayValue || 0),
      monthUsd: Number(monthValue || 0),
    }
  } catch {
    syncMemorySpendStamps(dayStamp, monthStamp)
    return {
      dayUsd: memorySpend.day,
      monthUsd: memorySpend.month,
    }
  }
}

export async function recordSpend(usd: number): Promise<void> {
  if (!Number.isFinite(usd) || usd <= 0) return

  const dayStamp = getDayStamp()
  const monthStamp = getMonthStamp()
  const redis = getRedisClient()

  if (!redis) {
    syncMemorySpendStamps(dayStamp, monthStamp)
    memorySpend.day += usd
    memorySpend.month += usd
    return
  }

  const dayKey = `${COST_POLICY.keyPrefix}:day:${dayStamp}`
  const monthKey = `${COST_POLICY.keyPrefix}:month:${monthStamp}`

  try {
    const recordSpendScript = redis.createScript<number>(RECORD_SPEND_SCRIPT)
    await recordSpendScript.exec(
      [dayKey, monthKey],
      [
        String(usd),
        String(COST_POLICY.daySpendTtlSeconds),
        String(COST_POLICY.monthSpendTtlSeconds),
      ]
    )
  } catch {
    syncMemorySpendStamps(dayStamp, monthStamp)
    memorySpend.day += usd
    memorySpend.month += usd
  }
}

export async function getCostMode(): Promise<{ mode: CostMode; dayUsd: number; monthUsd: number }> {
  const { dayUsd, monthUsd } = await readSpend()

  if (dayUsd >= COST_POLICY.dayHardLimitUsd || monthUsd >= COST_POLICY.monthHardLimitUsd) {
    return { mode: 'blocked', dayUsd, monthUsd }
  }

  if (dayUsd >= COST_POLICY.cacheOnlyAtUsd) {
    return { mode: 'cache_only', dayUsd, monthUsd }
  }

  if (dayUsd >= COST_POLICY.degradeAtUsd) {
    return { mode: 'degraded', dayUsd, monthUsd }
  }

  return { mode: 'normal', dayUsd, monthUsd }
}
