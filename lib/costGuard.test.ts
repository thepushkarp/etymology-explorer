import { describe, expect, test } from 'bun:test'
import { recordSpend, getCostMode, getSpendStats, usageToUSD } from '@/lib/costGuard'
import { CONFIG } from '@/lib/config'
import { createInMemoryRedis } from '@/lib/testSupport/inMemoryRedis'

const COST_KEY = `cost:usd:${new Date().toISOString().slice(0, 7)}`
const { monthlyLimitUSD, cacheOnlyAtPercent, pricingPerMillionTokens } = CONFIG.costTracking

describe('usageToUSD', () => {
  test('prefers the OpenRouter provider-reported cost when present', () => {
    expect(usageToUSD({ inputTokens: 1_000_000, outputTokens: 1_000_000, costUSD: 0.42 })).toBe(
      0.42
    )
  })

  test('falls back to config pricing math when no provider cost', () => {
    expect(usageToUSD({ inputTokens: 2_000_000, outputTokens: 1_000_000 })).toBeCloseTo(
      2 * pricingPerMillionTokens.input + pricingPerMillionTokens.output,
      10
    )
  })
})

describe('recordSpend', () => {
  test('accumulates extraction and synthesis spend across calls', async () => {
    const redis = createInMemoryRedis()

    // Root-extraction usage (previously thrown away) + synthesis usage.
    await recordSpend({ inputTokens: 0, outputTokens: 0, costUSD: 0.01 }, redis)
    await recordSpend({ inputTokens: 0, outputTokens: 0, costUSD: 0.02 }, redis)

    expect(Number(await redis.get(COST_KEY))).toBeCloseTo(0.03, 10)
  })

  test('sets a TTL on the first increment', async () => {
    const redis = createInMemoryRedis()

    await recordSpend({ inputTokens: 0, outputTokens: 0, costUSD: 0.01 }, redis)

    const ttl = redis.ttlMs(COST_KEY)
    expect(ttl).not.toBeNull()
    expect(ttl!).toBeGreaterThan(0)
  })

  test('repairs a missing TTL on later increments (EXPIRE NX)', async () => {
    const redis = createInMemoryRedis()

    // Simulate the legacy brittle state: a spend key with no TTL.
    await redis.set(COST_KEY, '1.5')
    expect(redis.ttlMs(COST_KEY)).toBeNull()

    await recordSpend({ inputTokens: 0, outputTokens: 0, costUSD: 0.01 }, redis)

    expect(redis.ttlMs(COST_KEY)).not.toBeNull()
  })

  test('does not shorten an existing TTL (EXPIRE NX skips keys with a TTL)', async () => {
    const redis = createInMemoryRedis()
    await recordSpend({ inputTokens: 0, outputTokens: 0, costUSD: 0.01 }, redis)
    const ttlBefore = redis.ttlMs(COST_KEY)

    await recordSpend({ inputTokens: 0, outputTokens: 0, costUSD: 0.01 }, redis)

    // Same TTL (no clock movement in the mock between calls beyond ms noise).
    expect(Math.abs(redis.ttlMs(COST_KEY)! - ttlBefore!)).toBeLessThan(1000)
  })

  test('is a no-op without Redis', async () => {
    await recordSpend({ inputTokens: 1000, outputTokens: 1000, costUSD: 1 }, null)
  })
})

describe('getCostMode 90% threshold', () => {
  test('stays normal below 90% of the monthly limit', async () => {
    const redis = createInMemoryRedis()
    await redis.set(COST_KEY, String(monthlyLimitUSD * cacheOnlyAtPercent - 0.01))

    expect(await getCostMode(redis)).toBe('normal')
  })

  test('switches to cache_only at 90% of the monthly limit', async () => {
    const redis = createInMemoryRedis()
    await redis.set(COST_KEY, String(monthlyLimitUSD * cacheOnlyAtPercent))

    expect(await getCostMode(redis)).toBe('cache_only')
  })

  test('threshold is 90%, not 100%', () => {
    expect(cacheOnlyAtPercent).toBe(0.9)
  })

  test('fails open to normal without Redis', async () => {
    expect(await getCostMode(null)).toBe('normal')
  })
})

describe('getSpendStats', () => {
  test('reports accumulated spend, limit, and mode', async () => {
    const redis = createInMemoryRedis()
    await recordSpend({ inputTokens: 0, outputTokens: 0, costUSD: 1.25 }, redis)

    const stats = await getSpendStats(redis)

    expect(stats).not.toBeNull()
    expect(stats!.spentUSD).toBeCloseTo(1.25, 10)
    expect(stats!.limitUSD).toBe(monthlyLimitUSD)
    expect(stats!.mode).toBe('normal')
  })
})
