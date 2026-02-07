import { RISK_POLICY } from '@/lib/config/guardrails'
import { getRedisClient } from '@/lib/server/redis'

interface MemoryWordBucket {
  words: Set<string>
  expiresAt: number
}

const memoryUniqueWords = new Map<string, MemoryWordBucket>()
let lastMemoryCleanupAt = 0

function currentMinuteBucket(): string {
  return new Date().toISOString().slice(0, 16)
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function pruneMemoryBuckets(currentTime: number): void {
  const shouldCleanupForSize = memoryUniqueWords.size > RISK_POLICY.memoryMaxBuckets
  const shouldCleanupForTime =
    currentTime - lastMemoryCleanupAt >= RISK_POLICY.memoryCleanupIntervalSeconds

  if (!shouldCleanupForSize && !shouldCleanupForTime) {
    return
  }

  lastMemoryCleanupAt = currentTime

  for (const [key, bucket] of memoryUniqueWords) {
    if (bucket.expiresAt <= currentTime) {
      memoryUniqueWords.delete(key)
    }
  }

  while (memoryUniqueWords.size > RISK_POLICY.memoryMaxBuckets) {
    const oldestKey = memoryUniqueWords.keys().next().value as string | undefined
    if (!oldestKey) break
    memoryUniqueWords.delete(oldestKey)
  }
}

async function recordUniqueWordAndGetCount(identityKey: string, word: string): Promise<number> {
  try {
    const redis = getRedisClient()
    const bucket = currentMinuteBucket()
    const key = `${RISK_POLICY.keyPrefix}:unique:${identityKey}:${bucket}`

    if (redis) {
      await redis.sadd(key, word)
      await redis.expire(key, RISK_POLICY.memoryBucketTtlSeconds)
      const count = await redis.scard(key)
      return Number(count)
    }

    const currentTime = nowSeconds()
    pruneMemoryBuckets(currentTime)

    const memoryKey = `${identityKey}:${bucket}`
    const existing = memoryUniqueWords.get(memoryKey)

    if (!existing || existing.expiresAt <= currentTime) {
      const words = new Set<string>([word])
      memoryUniqueWords.set(memoryKey, {
        words,
        expiresAt: currentTime + RISK_POLICY.memoryBucketTtlSeconds,
      })
      return words.size
    }

    existing.words.add(word)
    memoryUniqueWords.set(memoryKey, existing)
    pruneMemoryBuckets(currentTime)
    return existing.words.size
  } catch {
    return 0
  }
}

export interface RiskAssessment {
  score: number
  requiresChallenge: boolean
  reasons: string[]
}

export async function assessRisk(params: {
  identityKey: string
  userAgent: string
  word: string
  shortWindowCount: number
  shortWindowLimit: number
  isAuthenticated: boolean
}): Promise<RiskAssessment> {
  const { identityKey, userAgent, word, shortWindowCount, shortWindowLimit, isAuthenticated } = params

  const reasons: string[] = []
  let score = 0

  const usageRatio = shortWindowLimit > 0 ? shortWindowCount / shortWindowLimit : 0
  if (usageRatio >= RISK_POLICY.challengeUsageThreshold) {
    score += RISK_POLICY.highBurstScore
    reasons.push('high_burst_usage')
  }

  if (!userAgent) {
    score += RISK_POLICY.missingUserAgentScore
    reasons.push('missing_user_agent')
  } else if (RISK_POLICY.suspiciousUserAgentPattern.test(userAgent)) {
    score += RISK_POLICY.suspiciousUserAgentScore
    reasons.push('suspicious_user_agent')
  }

  const uniqueWordsPerMinute = await recordUniqueWordAndGetCount(identityKey, word)
  if (uniqueWordsPerMinute >= RISK_POLICY.suspiciousUniqueWordsPerMinute) {
    score += RISK_POLICY.highUniqueWordScore
    reasons.push('high_unique_words_per_minute')
  }

  if (!isAuthenticated) {
    score += RISK_POLICY.anonymousBaseScore
  }

  return {
    score,
    requiresChallenge: score >= RISK_POLICY.challengeScoreThreshold,
    reasons,
  }
}
