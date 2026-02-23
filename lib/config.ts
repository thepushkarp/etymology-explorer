/**
 * Centralized configuration for all tunable thresholds.
 * Every other module imports from here — single source of truth.
 */

export const CONFIG = {
  // LLM
  model: 'gemini-3-flash-preview',
  synthesisMaxTokens: 2048,
  rootExtractionMaxTokens: 100,

  retries: {
    malformedOutputRetries: 1,
  },

  grounding: {
    googleSearchEnabled: process.env.GOOGLE_SEARCH_GROUNDING_ENABLED !== 'false',
    enableWhenNoParsedChains: true,
    enableWhenCoreSourcesMissing: true,
    enableOnMalformedRetry: true,
  },

  // Input validation
  maxWordLength: 35,
  wordPattern: /^[\p{L}][\p{L}'\-]*[\p{L}]$|^[\p{L}]$/u, // Unicode letters + internal '/-
  maxRequestBodyBytes: 1024,

  // Rate limits (per IP)
  rateLimit: {
    etymology: { requests: 20, window: '1 m' },
    etymologyDaily: { requests: 200, window: '24 h' },
    pronunciation: { requests: 20, window: '1 m' },
    general: { requests: 60, window: '1 m' },
  },

  // Source data limits (prompt injection defense)
  maxSourceTextChars: 3000,

  // Research pipeline
  maxRootsToExplore: 3,
  maxRelatedWordsPerRoot: 2,
  maxTotalFetches: 10,

  // Cache TTLs (seconds)
  etymologyCacheTTL: 30 * 24 * 60 * 60, // 30 days
  audioCacheTTL: 365 * 24 * 60 * 60, // 1 year
  negativeCacheTTL: 6 * 60 * 60, // 6 hours — prevents repeated fetches for gibberish

  // Timeouts (milliseconds)
  timeouts: {
    source: 4_000,
    llm: 15_000, // Gemini API
    tts: 8_000, // ElevenLabs
  },

  // Singleflight deduplication
  singleflight: {
    lockTTL: 30, // seconds — auto-expires if holder crashes
    pollIntervalMs: 500,
    maxPolls: 16, // 8s total wait
  },

  // USD-based cost tracking
  costTracking: {
    pricingPerMillionTokens: { input: 0.5, output: 3.0 },
    monthlyLimitUSD: 10.0,
    cacheOnlyAtPercent: 0.9, // serve only cached results at 90%
  },

  // Feature flags
  features: {
    publicSearchEnabled: process.env.PUBLIC_SEARCH_ENABLED !== 'false',
    pronunciationEnabled: process.env.PRONUNCIATION_ENABLED !== 'false',
    forceCacheOnly: process.env.FORCE_CACHE_ONLY === 'true',
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  },

  // Protection model (budget-based degradation ladder)
  protection: {
    protected503AtPercent: 0.7, // 503 for uncached expensive requests at 70%
    cooldownWindowMs: 5 * 60_000, // 5 min hysteresis before stepping down
  },

  // Cache hardening
  cache: {
    ttlJitterPercent: 0.1, // ±10% jitter on TTLs
    negativeCacheAdmitOnly: ['no_sources', 'invalid_word'] as readonly string[],
  },

  // Redis prefixes
  rateLimitPrefix: 'rl',
  budgetPrefix: 'budget',
} as const
