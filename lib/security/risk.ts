import { RISK_POLICY } from '@/lib/config/guardrails'
import { getRedisClient } from '@/lib/server/redis'

const memoryUniqueWords = new Map<string, Set<string>>()

function currentMinuteBucket(): string {
  return new Date().toISOString().slice(0, 16)
}

async function recordUniqueWordAndGetCount(identityKey: string, word: string): Promise<number> {
  try {
    const redis = getRedisClient()
    const bucket = currentMinuteBucket()
    const key = `${RISK_POLICY.keyPrefix}:unique:${identityKey}:${bucket}`

    if (redis) {
      await redis.sadd(key, word)
      await redis.expire(key, 60)
      const count = await redis.scard(key)
      return Number(count)
    }

    const memoryKey = `${identityKey}:${bucket}`
    const set = memoryUniqueWords.get(memoryKey) || new Set<string>()
    set.add(word)
    memoryUniqueWords.set(memoryKey, set)
    return set.size
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
