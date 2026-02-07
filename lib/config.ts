/**
 * Centralized configuration for all tunable thresholds.
 * Every other module imports from here — single source of truth.
 */

export const CONFIG = {
  // LLM
  model: 'claude-haiku-4-5-20251001',
  synthesisMaxTokens: 2048,
  rootExtractionMaxTokens: 100,

  // Input validation
  maxWordLength: 45,
  wordPattern: /^[a-zA-Z]+$/,
  maxRequestBodyBytes: 1024,

  // Rate limits (per IP)
  rateLimit: {
    etymology: { requests: 10, window: '1 m' },
    etymologyDaily: { requests: 100, window: '24 h' },
    pronunciation: { requests: 20, window: '1 m' },
    general: { requests: 60, window: '1 m' },
  },

  // Global daily budget caps (across all users)
  dailyBudget: {
    etymology: 2000,
    pronunciation: 500,
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

  // Redis prefixes
  rateLimitPrefix: 'rl',
  budgetPrefix: 'budget',
} as const
