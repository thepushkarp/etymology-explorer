import { CONFIG } from '@/lib/config'
import { getRedis } from '@/lib/redis'
import type { LearnerEtymologyResult, LookupResolution } from '@/lib/types'
import { after } from 'next/server'
import { revalidateTag } from 'next/cache'
import { LearnerEtymologyResultSchema } from '@/lib/schemas/etymology'

const RESOLUTION_TTL = 7 * 24 * 60 * 60
export const JAPANESE_RESULT_VERSION = '1'
export const JAPANESE_RESULT_PREFIX = `etymology:learner:v${JAPANESE_RESULT_VERSION}:ja:`

function normalizedQuery(query: string): string {
  return query.normalize('NFKC').trim().toLowerCase()
}

export async function getCachedJapaneseResolution(query: string): Promise<LookupResolution | null> {
  const redis = getRedis()
  if (!redis) return null
  return redis.get<LookupResolution>(`resolve:ja:v1:${normalizedQuery(query)}`).catch(() => null)
}

export async function cacheJapaneseResolution(
  query: string,
  resolution: LookupResolution
): Promise<void> {
  if (resolution.status === 'not_found') return
  const redis = getRedis()
  if (!redis) return
  await redis
    .set(`resolve:ja:v1:${normalizedQuery(query)}`, resolution, { ex: RESOLUTION_TTL })
    .catch(() => undefined)
}

export async function getCachedJapaneseResult(
  entryId: string
): Promise<LearnerEtymologyResult | null> {
  const redis = getRedis()
  if (!redis) return null
  const cached = await redis
    .get<LearnerEtymologyResult>(`${JAPANESE_RESULT_PREFIX}${entryId}`)
    .catch(() => null)
  const parsed = LearnerEtymologyResultSchema.safeParse(cached)
  return parsed.success ? (parsed.data as LearnerEtymologyResult) : null
}

export async function cacheJapaneseResult(result: LearnerEtymologyResult): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis
    .set(`${JAPANESE_RESULT_PREFIX}${result.entryId}`, result, {
      ex: CONFIG.etymologyCacheTTL,
    })
    .catch(() => undefined)
  try {
    after(() => revalidateTag(japaneseEntryTag(result.entryId), { expire: 0 }))
  } catch {
    // Tests and updater scripts run outside a Next request scope.
  }
}

export function japaneseEntryTag(entryId: string): string {
  return `etymology-word:ja:entry:${entryId}`
}

export async function getJapaneseNegativeResolution(query: string): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  return redis
    .exists(`neg:ja:resolve:v1:${normalizedQuery(query)}`)
    .then((value) => value === 1)
    .catch(() => false)
}

export async function cacheJapaneseNegativeResolution(query: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis
    .set(`neg:ja:resolve:v1:${normalizedQuery(query)}`, '1', { ex: CONFIG.negativeCacheTTL })
    .catch(() => undefined)
}
