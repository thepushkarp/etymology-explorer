/**
 * Centralized configuration for all tunable thresholds.
 * Every other module imports from here — single source of truth.
 */

export const CONFIG = {
  // LLM
  model: 'openai/gpt-5.4-mini',
  synthesisMaxTokens: 9000,
  rootExtractionMaxTokens: 100,

  retries: {
    malformedOutputRetries: 1,
  },

  // Input validation
  maxWordLength: 35,
  wordPattern: /^[\p{L}][\p{L}'\-]*[\p{L}]$|^[\p{L}]$/u, // Unicode letters + internal '/-

  // Rate limits (per IP)
  rateLimit: {
    etymology: { requests: 20, window: '1 m' },
    etymologyDaily: { requests: 200, window: '24 h' },
    pronunciation: { requests: 20, window: '1 m' },
    general: { requests: 60, window: '1 m' },
  },

  // Per-block character budgets for synthesis prompt source data
  // (prompt injection defense + token diet — tiered by evidentiary value)
  promptBudget: {
    mainSourceChars: 5000, // etymonline/wiktionary text for the searched word
    supplementalSourceChars: 1500, // wikipedia / freeDictionary / urban / incels
    rootSourceChars: 2500, // per-source text for each explored root
    relatedSourceChars: 1000, // per-source text for each related term
    rootExtractionSourceChars: 1800, // per-source input to the LLM root-extraction fallback
  },

  // Research pipeline
  maxRootsToExplore: 4,
  maxRelatedWordsPerRoot: 4,
  maxTotalFetches: 16,

  // Cache TTLs (seconds)
  etymologyCacheTTL: 30 * 24 * 60 * 60, // 30 days
  audioCacheTTL: 365 * 24 * 60 * 60, // 1 year
  negativeCacheTTL: 6 * 60 * 60, // 6 hours — prevents repeated fetches for gibberish
  sourceCacheTTL: 7 * 24 * 60 * 60, // 7 days — raw etymonline/wiktionary page data

  // Timeouts (milliseconds)
  timeouts: {
    source: 5_000,
    llm: 90_000, // synthesis call — benchmark p95 is ~22s, 90s leaves retry room in maxDuration
    rootExtraction: 15_000, // ~100-token output; no reason to inherit the synthesis timeout
    tts: 15_000, // ElevenLabs eleven_v3 is higher-latency than turbo; route maxDuration is 60s so 15s is safe, and audio is cached ~1yr so the slower call is one-time per word
  },

  // Singleflight deduplication (owner-token locks, see lib/singleflight.ts)
  singleflight: {
    lockTTLSeconds: 90, // auto-expires if holder crashes; holder heartbeats to extend
    heartbeatIntervalMs: 30_000, // holder re-EXPIREs the lock while the pipeline runs
    waiterPollIntervalMs: 2_000, // waiters re-check the cache at this cadence
    streamWaiterMaxWaitMs: 150_000, // streaming waiters keep the SSE open this long
    unaryWaiterMaxWaitMs: 10_000, // non-streaming waiters give up (429) after this
    failureMarkerTTLSeconds: 60, // holder-failure marker; blocks waiter promotion, not retries
  },

  // USD-based cost tracking
  costTracking: {
    pricingPerMillionTokens: { input: 0.75, output: 4.5 }, // fallback when OpenRouter omits cost
    monthlyLimitUSD: 10.0,
    cacheOnlyAtPercent: 0.9, // serve only cached results at 90% of budget
  },

  // Feature flags
  features: {
    publicSearchEnabled: process.env.PUBLIC_SEARCH_ENABLED !== 'false',
    pronunciationEnabled: process.env.PRONUNCIATION_ENABLED !== 'false',
    forceCacheOnly: process.env.FORCE_CACHE_ONLY === 'true',
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
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
