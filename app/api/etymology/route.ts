import { NextRequest, NextResponse } from 'next/server'

import { ApiResponse, EtymologyResult } from '@/lib/types'
import { EtymologyRequestSchema } from '@/lib/schemas/api'
import { synthesizeFromResearch } from '@/lib/claude'
import { conductAgenticResearch } from '@/lib/research'
import { isLikelyTypo, getSuggestions } from '@/lib/spellcheck'
import { getRandomWord } from '@/lib/wordlist'
import { getQuirkyMessage } from '@/lib/prompts'
import {
  acquireSingleflightLock,
  cacheEtymology,
  cacheNegative,
  getCachedEtymology,
  getNegativeCache,
  releaseSingleflightLock,
  waitForCachedEtymology,
} from '@/lib/cache'
import {
  INPUT_POLICY,
  RATE_LIMIT_POLICY,
  buildWordKey,
  estimateUsdFromTokens,
  getTierForRequest,
} from '@/lib/config/guardrails'
import { getCostMode, recordSpend, reserveDailyRequestBudget } from '@/lib/security/cost-guard'
import { applyRateLimit } from '@/lib/security/rate-limit'
import { getRequestIdentity } from '@/lib/security/request-meta'
import { safeErrorMessage } from '@/lib/security/redact'
import { assessRisk } from '@/lib/security/risk'
import { getServerEnv } from '@/lib/server/env'
import { isChallengeConfigured, verifyChallengeToken } from '@/lib/security/challenge'

type EtymologyResponse = ApiResponse<EtymologyResult> & {
  cached: boolean
  mode?: string
}

function jsonWithHeaders(body: unknown, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers,
  })
}

function secondsUntilNextUtcDay(): number {
  const now = new Date()
  const nextUtcMidnightMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  )
  return Math.max(1, Math.ceil((nextUtcMidnightMs - now.getTime()) / 1000))
}

export async function POST(request: NextRequest) {
  const identity = getRequestIdentity(request)

  let locked = false
  let normalizedWord = ''
  let modelForLock = ''

  try {
    const env = getServerEnv()

    if (!env.featureFlags.publicSearchEnabled) {
      return jsonWithHeaders(
        {
          success: false,
          error: 'Search is currently disabled by the operator',
        },
        503
      )
    }

    const rawBody = await request.text()
    if (Buffer.byteLength(rawBody, 'utf8') > INPUT_POLICY.maxRequestBodyBytes) {
      return jsonWithHeaders(
        {
          success: false,
          error: 'Request body is too large',
        },
        413
      )
    }

    let parsedJson: Record<string, unknown>
    try {
      parsedJson = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return jsonWithHeaders(
        {
          success: false,
          error: 'Invalid JSON payload',
        },
        400
      )
    }

    if ('llmConfig' in parsedJson) {
      return jsonWithHeaders(
        {
          success: false,
          error: 'Legacy llmConfig payload is no longer supported',
        },
        400
      )
    }

    const parsed = EtymologyRequestSchema.safeParse(parsedJson)
    if (!parsed.success) {
      return jsonWithHeaders(
        {
          success: false,
          error: parsed.error.issues[0]?.message || 'Invalid request payload',
        },
        400
      )
    }

    const challengeToken = parsed.data.challengeToken
    normalizedWord = buildWordKey(parsed.data.word)

    if (!normalizedWord) {
      return jsonWithHeaders(
        {
          success: false,
          error: getQuirkyMessage('empty'),
        },
        400
      )
    }

    const tier = getTierForRequest(identity.isAuthenticated ? identity.sessionKey : null)

    const rateDecision = await applyRateLimit({
      route: 'etymology',
      tier,
      key: identity.sessionKey,
    })

    if (!rateDecision.allowed) {
      return jsonWithHeaders(
        {
          success: false,
          error: 'Rate limit exceeded. Please wait a moment and try again.',
          data: { errorCode: 'rate_limited' },
        },
        429,
        {
          ...rateDecision.headers,
          'Retry-After': String(rateDecision.retryAfterSeconds),
        }
      )
    }

    const risk = await assessRisk({
      identityKey: identity.sessionKey,
      userAgent: identity.userAgent,
      word: normalizedWord,
      shortWindowCount: rateDecision.shortWindowCount,
      shortWindowLimit: RATE_LIMIT_POLICY.routes.etymology[tier].shortWindowLimit,
      isAuthenticated: tier === 'authenticated',
    })

    const challengeConfigured = isChallengeConfigured()

    if (risk.requiresChallenge && challengeConfigured) {
      if (!challengeToken) {
        return jsonWithHeaders(
          {
            success: false,
            error: 'Challenge required for this request',
            data: { errorCode: 'challenge_required', reasons: risk.reasons },
          },
          403,
          rateDecision.headers
        )
      }

      const verified = await verifyChallengeToken(challengeToken, identity.ip)
      if (!verified) {
        return jsonWithHeaders(
          {
            success: false,
            error: 'Challenge verification failed',
            data: { errorCode: 'challenge_failed' },
          },
          403,
          rateDecision.headers
        )
      }
    }

    const model = env.anthropicModel
    modelForLock = model

    const cached = await getCachedEtymology(normalizedWord, model)
    if (cached) {
      return jsonWithHeaders(
        {
          success: true,
          data: cached,
          cached: true,
          mode: 'cached',
        } satisfies EtymologyResponse,
        200,
        {
          ...rateDecision.headers,
          'X-Cache': 'HIT',
        }
      )
    }

    const hasNegativeCache = await getNegativeCache(normalizedWord, model)
    if (hasNegativeCache) {
      return jsonWithHeaders(
        {
          success: false,
          error: getQuirkyMessage('nonsense'),
        },
        404,
        rateDecision.headers
      )
    }

    const costState = await getCostMode()
    const mode = env.featureFlags.forceCacheOnly ? 'cache_only' : costState.mode

    if (mode === 'blocked') {
      return jsonWithHeaders(
        {
          success: false,
          error: 'Search is temporarily unavailable due to daily cost limits',
        },
        503,
        {
          ...rateDecision.headers,
          'Retry-After': '3600',
          'X-Cost-Mode': mode,
        }
      )
    }

    if (mode === 'cache_only') {
      return jsonWithHeaders(
        {
          success: false,
          error: 'Search is in cache-only mode right now. Please try again later.',
        },
        503,
        {
          ...rateDecision.headers,
          'Retry-After': '900',
          'X-Cost-Mode': mode,
        }
      )
    }

    locked = await acquireSingleflightLock(normalizedWord, model, identity.sessionKey)
    if (!locked) {
      const waited = await waitForCachedEtymology(normalizedWord, model)
      if (waited) {
        return jsonWithHeaders(
          {
            success: true,
            data: waited,
            cached: true,
            mode: 'waited_cache',
          } satisfies EtymologyResponse,
          200,
          {
            ...rateDecision.headers,
            'X-Cache': 'HIT',
            'X-Singleflight': 'WAITED',
          }
        )
      }

      return jsonWithHeaders(
        {
          success: false,
          error: 'This word is being processed. Please retry shortly.',
        },
        429,
        {
          ...rateDecision.headers,
          'Retry-After': '2',
          'X-Singleflight': 'BUSY',
        }
      )
    }

    const budgetDecision = await reserveDailyRequestBudget('etymology')
    if (!budgetDecision.allowed) {
      return jsonWithHeaders(
        {
          success: false,
          error: 'Search is temporarily unavailable due to daily request budget limits',
        },
        503,
        {
          ...rateDecision.headers,
          'Retry-After': String(secondsUntilNextUtcDay()),
        }
      )
    }

    const researchContext = await conductAgenticResearch(normalizedWord, {
      includeWikipedia: mode !== 'degraded',
      includeUrbanDictionary: mode !== 'degraded',
      extractRoots: true,
    })

    if (!researchContext.mainWord.etymonline && !researchContext.mainWord.wiktionary) {
      const shouldNegativeCache =
        researchContext.mainWord.etymonlineStatus === 'not_found' &&
        researchContext.mainWord.wiktionaryStatus === 'not_found'

      if (shouldNegativeCache) {
        await cacheNegative(normalizedWord, model)
      }

      if (isLikelyTypo(normalizedWord)) {
        const suggestions = getSuggestions(normalizedWord)
        return jsonWithHeaders(
          {
            success: false,
            error: `Hmm, we couldn't find "${normalizedWord}". Did you mean:`,
            data: { suggestions: suggestions.map((s) => s.word) },
          },
          404,
          rateDecision.headers
        )
      }

      const suggestion = getRandomWord()
      return jsonWithHeaders(
        {
          success: false,
          error: getQuirkyMessage('nonsense'),
          data: { suggestion },
        },
        404,
        rateDecision.headers
      )
    }

    const synthesis = await synthesizeFromResearch(researchContext)

    await cacheEtymology(normalizedWord, model, synthesis.result)

    const usd = estimateUsdFromTokens(synthesis.usage.inputTokens, synthesis.usage.outputTokens)
    await recordSpend(usd)

    return jsonWithHeaders(
      {
        success: true,
        data: synthesis.result,
        cached: false,
        mode,
      } satisfies EtymologyResponse,
      200,
      {
        ...rateDecision.headers,
        'X-Cache': 'MISS',
        'X-Cost-Mode': mode,
      }
    )
  } catch (error) {
    console.error('Etymology API error:', safeErrorMessage(error))

    if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
      return jsonWithHeaders(
        {
          success: false,
          error: 'Etymology service is not configured on the server',
        },
        503
      )
    }

    return jsonWithHeaders(
      {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
      },
      500
    )
  } finally {
    if (locked && normalizedWord && modelForLock) {
      releaseSingleflightLock(normalizedWord, modelForLock).catch(() => {
        // lock release failure should never fail the request lifecycle
      })
    }
  }
}
