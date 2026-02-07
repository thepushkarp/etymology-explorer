import { GuardedRoute, RATE_LIMIT_POLICY, RequestTier } from '@/lib/config/guardrails'
import { getRedisClient } from '@/lib/server/redis'

interface MemoryCounter {
  count: number
  expiresAt: number
}

const memoryCounters = new Map<string, MemoryCounter>()
let lastMemoryCleanupAt = 0

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function pruneMemoryCounters(currentTime: number): void {
  const shouldCleanupForSize = memoryCounters.size > RATE_LIMIT_POLICY.memoryMaxEntries
  const shouldCleanupForTime =
    currentTime - lastMemoryCleanupAt >= RATE_LIMIT_POLICY.memoryCleanupIntervalSeconds

  if (!shouldCleanupForSize && !shouldCleanupForTime) {
    return
  }

  lastMemoryCleanupAt = currentTime

  for (const [entryKey, counter] of memoryCounters) {
    if (counter.expiresAt <= currentTime) {
      memoryCounters.delete(entryKey)
    }
  }

  while (memoryCounters.size > RATE_LIMIT_POLICY.memoryMaxEntries) {
    const oldestKey = memoryCounters.keys().next().value as string | undefined
    if (!oldestKey) break
    memoryCounters.delete(oldestKey)
  }
}

async function incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
  try {
    const redis = getRedisClient()
    if (redis) {
      const count = await redis.incr(key)
      if (count === 1) {
        await redis.expire(key, ttlSeconds)
      }
      return Number(count)
    }
  } catch {
    // Fall back to in-memory counters if Redis has transient errors.
  }

  const currentTime = nowSeconds()
  pruneMemoryCounters(currentTime)
  const existing = memoryCounters.get(key)

  if (!existing || existing.expiresAt <= currentTime) {
    memoryCounters.set(key, { count: 1, expiresAt: currentTime + ttlSeconds })
    return 1
  }

  existing.count += 1
  memoryCounters.set(key, existing)
  pruneMemoryCounters(currentTime)
  return existing.count
}

export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
  headers: Record<string, string>
  shortWindowCount: number
  dayWindowCount: number
}

export async function applyRateLimit(params: {
  route: GuardedRoute
  tier: RequestTier
  key: string
}): Promise<RateLimitDecision> {
  const { route, tier, key } = params
  const limits = RATE_LIMIT_POLICY.routes[route][tier]

  const shortKey = `${RATE_LIMIT_POLICY.keyPrefix}:${route}:short:${key}`
  const dayKey = `${RATE_LIMIT_POLICY.keyPrefix}:${route}:day:${key}`

  const [shortWindowCount, dayWindowCount] = await Promise.all([
    incrementWithTtl(shortKey, RATE_LIMIT_POLICY.shortWindowSeconds),
    incrementWithTtl(dayKey, RATE_LIMIT_POLICY.dayWindowSeconds),
  ])

  const shortRemaining = Math.max(0, limits.shortWindowLimit - shortWindowCount)
  const dayRemaining = Math.max(0, limits.dayLimit - dayWindowCount)
  const remaining = Math.min(shortRemaining, dayRemaining)

  const shortExceeded = shortWindowCount > limits.shortWindowLimit
  const dayExceeded = dayWindowCount > limits.dayLimit
  const allowed = !shortExceeded && !dayExceeded

  const retryAfterSeconds = shortExceeded
    ? RATE_LIMIT_POLICY.shortWindowSeconds
    : dayExceeded
      ? RATE_LIMIT_POLICY.dayWindowSeconds
      : 0

  return {
    allowed,
    retryAfterSeconds,
    headers: {
      'X-RateLimit-Limit': String(limits.shortWindowLimit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Window': String(RATE_LIMIT_POLICY.shortWindowSeconds),
    },
    shortWindowCount,
    dayWindowCount,
  }
}
