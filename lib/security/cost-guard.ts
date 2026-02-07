import { COST_POLICY, CostMode } from '@/lib/config/guardrails'
import { getRedisClient } from '@/lib/server/redis'

interface MemorySpend {
  day: number
  month: number
  dayStamp: string
  monthStamp: string
}

const memorySpend: MemorySpend = {
  day: 0,
  month: 0,
  dayStamp: '',
  monthStamp: '',
}

function getDayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function getMonthStamp(): string {
  return new Date().toISOString().slice(0, 7)
}

async function readSpend(): Promise<{ dayUsd: number; monthUsd: number }> {
  const dayStamp = getDayStamp()
  const monthStamp = getMonthStamp()
  const redis = getRedisClient()

  if (!redis) {
    if (memorySpend.dayStamp !== dayStamp) {
      memorySpend.dayStamp = dayStamp
      memorySpend.day = 0
    }
    if (memorySpend.monthStamp !== monthStamp) {
      memorySpend.monthStamp = monthStamp
      memorySpend.month = 0
    }
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
    if (memorySpend.dayStamp !== dayStamp) {
      memorySpend.dayStamp = dayStamp
      memorySpend.day = 0
    }
    if (memorySpend.monthStamp !== monthStamp) {
      memorySpend.monthStamp = monthStamp
      memorySpend.month = 0
    }
    memorySpend.day += usd
    memorySpend.month += usd
    return
  }

  const dayKey = `${COST_POLICY.keyPrefix}:day:${dayStamp}`
  const monthKey = `${COST_POLICY.keyPrefix}:month:${monthStamp}`

  try {
    await Promise.all([
      redis.incrbyfloat(dayKey, usd),
      redis.expire(dayKey, 2 * 24 * 60 * 60),
      redis.incrbyfloat(monthKey, usd),
      redis.expire(monthKey, 45 * 24 * 60 * 60),
    ])
  } catch {
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
