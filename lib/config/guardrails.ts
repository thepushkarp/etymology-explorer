export type RequestTier = 'anonymous' | 'authenticated'
export type GuardedRoute = 'etymology' | 'pronunciation'
export type CostMode = 'normal' | 'degraded' | 'cache_only' | 'blocked'

export const LLM_POLICY = {
  provider: 'anthropic' as const,
  defaultModel: 'claude-haiku-4-5-20251001',
  allowedModelPrefix: 'claude-haiku-4-5',
  maxTokens: 2048,
  rootExtractionMaxTokens: 100,
  // Centralized model pricing used by cost guardrails (USD per 1M tokens)
  pricingUsdPerMillion: {
    input: 0.8,
    output: 4,
  },
} as const

export const RATE_LIMIT_POLICY = {
  keyPrefix: 'ratelimit:v1',
  shortWindowSeconds: 10 * 60,
  dayWindowSeconds: 24 * 60 * 60,
  memoryMaxEntries: 20_000,
  memoryCleanupIntervalSeconds: 60,
  routes: {
    etymology: {
      anonymous: {
        shortWindowLimit: 8,
        dayLimit: 30,
      },
      authenticated: {
        shortWindowLimit: 30,
        dayLimit: 300,
      },
    },
    pronunciation: {
      anonymous: {
        shortWindowLimit: 5,
        dayLimit: 20,
      },
      authenticated: {
        shortWindowLimit: 20,
        dayLimit: 120,
      },
    },
  },
} as const

export const RISK_POLICY = {
  keyPrefix: 'risk:v1',
  challengeUsageThreshold: 0.7,
  suspiciousUniqueWordsPerMinute: 12,
  challengeScoreThreshold: 0.8,
  memoryBucketTtlSeconds: 2 * 60,
  memoryMaxBuckets: 10_000,
  memoryCleanupIntervalSeconds: 60,
  suspiciousUserAgentPattern:
    /bot|crawler|spider|curl|wget|python|httpclient|go-http-client|scrapy|headless/i,
  missingUserAgentScore: 0.35,
  suspiciousUserAgentScore: 0.55,
  highBurstScore: 0.35,
  highUniqueWordScore: 0.4,
  anonymousBaseScore: 0.1,
} as const

export const COST_POLICY = {
  keyPrefix: 'cost:v1',
  dayHardLimitUsd: 20,
  monthHardLimitUsd: 400,
  degradeAtUsd: 12,
  cacheOnlyAtUsd: 18,
  dailyRequestBudget: {
    etymology: RATE_LIMIT_POLICY.routes.etymology.anonymous.dayLimit,
    pronunciation: RATE_LIMIT_POLICY.routes.pronunciation.anonymous.dayLimit,
  },
} as const

export const CACHE_POLICY = {
  keyPrefix: 'cache:v3',
  memoryMaxEntries: 50_000,
  memoryCleanupIntervalSeconds: 60,
  etymologyTtlSeconds: 45 * 24 * 60 * 60,
  negativeTtlSeconds: 6 * 60 * 60,
  sourceTtlSeconds: 7 * 24 * 60 * 60,
  audioTtlSeconds: 365 * 24 * 60 * 60,
  singleflightLockTtlSeconds: 15,
  singleflightPollCount: 8,
  singleflightPollDelayMs: 500,
} as const

export const TIMEOUT_POLICY = {
  externalFetchMs: 4_000,
  llmMs: 15_000,
  ttsMs: 8_000,
} as const

export const INPUT_POLICY = {
  maxRequestBodyBytes: 1024,
  wordMinLength: 2,
  wordMaxLength: 48,
  suggestionQueryMaxLength: 48,
  suggestionQueryPattern: /^[a-zA-Z'-]+$/,
  challengeTokenMaxLength: 2048,
} as const

export const RESEARCH_POLICY = {
  maxRootsToExplore: 3,
  maxRelatedWordsPerRoot: 2,
  maxTotalFetches: 10,
  urbanMinThumbsUp: 100,
} as const

export const FEATURE_FLAGS = {
  publicSearchEnabled: true,
  forceCacheOnly: false,
  disablePronunciation: false,
  cspReportOnly: true,
} as const

export const SECURITY_POLICY = {
  trustProxyHeaders: false,
} as const

export const ADMIN_POLICY = {
  headerName: 'x-admin-secret',
} as const

export const IDENTITY_POLICY = {
  signedUserIdCookieName: 'user-id',
  signedUserIdSignatureCookieName: 'user-id-sig',
} as const

export function getTierForRequest(identityKey?: string | null): RequestTier {
  return identityKey ? 'authenticated' : 'anonymous'
}

export function buildWordKey(input: string): string {
  return input.toLowerCase().trim()
}

export function estimateUsdFromTokens(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * LLM_POLICY.pricingUsdPerMillion.input
  const outputCost = (outputTokens / 1_000_000) * LLM_POLICY.pricingUsdPerMillion.output
  return Number((inputCost + outputCost).toFixed(6))
}
