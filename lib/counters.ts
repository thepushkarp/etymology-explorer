/**
 * Cheap monthly operational counters (cache hits/misses/errors) backed by
 * Redis INCR. Exposed via /api/admin/stats. All operations fail silently —
 * counters are best-effort observability, never a request dependency.
 */

import { getRedis } from './redis'
import { safeError } from './errorUtils'
import { SUPPORTED_LANGUAGE_CODES, type LanguageCode } from './languages'

const COUNTER_NAMES = ['cache_hit', 'cache_miss', 'error'] as const

export type CounterName = (typeof COUNTER_NAMES)[number]
const LANGUAGE_METRICS = [
  'request',
  'cache_hit',
  'cache_miss',
  'no_source',
  'schema_failure',
  'pronunciation_failure',
] as const
export type LanguageMetric = (typeof LANGUAGE_METRICS)[number]

// Keys are month-scoped; keep two full months so a report at month boundary
// still sees the previous period before the key expires.
const COUNTER_TTL_SECONDS = 62 * 24 * 60 * 60

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function counterKey(name: CounterName): string {
  return `counters:v1:${currentMonth()}:${name}`
}

export async function incrCounter(name: CounterName): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    const key = counterKey(name)
    const pipeline = redis.pipeline()
    pipeline.incr(key)
    pipeline.expire(key, COUNTER_TTL_SECONDS, 'nx')
    await pipeline.exec()
  } catch (error) {
    console.error('[Counters] incrCounter failed:', safeError(error))
  }
}

function languageCounterKey(language: LanguageCode, metric: LanguageMetric): string {
  return `counters:v2:${currentMonth()}:${language}:${metric}`
}

export async function incrLanguageCounter(
  language: LanguageCode,
  metric: LanguageMetric
): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    const key = languageCounterKey(language, metric)
    const pipeline = redis.pipeline()
    pipeline.incr(key)
    pipeline.expire(key, COUNTER_TTL_SECONDS, 'nx')
    await pipeline.exec()
  } catch (error) {
    console.error('[Counters] incrLanguageCounter failed:', safeError(error))
  }
}

export async function getLanguageCounters(): Promise<Record<
  LanguageCode,
  Record<LanguageMetric, number>
> | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const keys = SUPPORTED_LANGUAGE_CODES.flatMap((language) =>
      LANGUAGE_METRICS.map((metric) => languageCounterKey(language, metric))
    )
    const values = await redis.mget<(number | null)[]>(...keys)
    let index = 0
    return Object.fromEntries(
      SUPPORTED_LANGUAGE_CODES.map((language) => [
        language,
        Object.fromEntries(
          LANGUAGE_METRICS.map((metric) => [metric, Number(values[index++] ?? 0)])
        ),
      ])
    ) as Record<LanguageCode, Record<LanguageMetric, number>>
  } catch (error) {
    console.error('[Counters] getLanguageCounters failed:', safeError(error))
    return null
  }
}

export async function getCounters(): Promise<Record<CounterName, number> | null> {
  const redis = getRedis()
  if (!redis) return null

  try {
    const values = await redis.mget<(number | null)[]>(
      ...COUNTER_NAMES.map((name) => counterKey(name))
    )
    const counters = {} as Record<CounterName, number>
    COUNTER_NAMES.forEach((name, index) => {
      counters[name] = Number(values[index] ?? 0)
    })
    return counters
  } catch (error) {
    console.error('[Counters] getCounters failed:', safeError(error))
    return null
  }
}
