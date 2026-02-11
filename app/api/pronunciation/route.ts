import { NextRequest, NextResponse } from 'next/server'

import { cacheAudio, getCachedAudio } from '@/lib/cache'
import { RATE_LIMIT_POLICY, getTierForRequest } from '@/lib/config/guardrails'
import { generatePronunciation, isElevenLabsConfigured } from '@/lib/elevenlabs'
import { PronunciationQuerySchema } from '@/lib/schemas/api'
import { isChallengeConfigured, verifyChallengeToken } from '@/lib/security/challenge'
import { getCostMode, reserveDailyRequestBudget } from '@/lib/security/cost-guard'
import { applyRateLimit } from '@/lib/security/rate-limit'
import { getRequestIdentity } from '@/lib/security/request-meta'
import { safeErrorMessage } from '@/lib/security/redact'
import { assessRisk } from '@/lib/security/risk'
import { getServerEnv } from '@/lib/server/env'

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

/**
 * GET /api/pronunciation?word=example
 *
 * Returns MP3 audio for word pronunciation.
 * Uses Redis cache for repeated requests, ElevenLabs TTS for generation.
 */
export async function GET(request: NextRequest) {
  const env = getServerEnv()
  const identity = getRequestIdentity(request)

  if (env.featureFlags.disablePronunciation) {
    return NextResponse.json(
      { success: false, error: 'Pronunciation is currently disabled by the operator' },
      { status: 503 }
    )
  }

  const queryParse = PronunciationQuerySchema.safeParse({
    word: request.nextUrl.searchParams.get('word'),
    challengeToken: request.nextUrl.searchParams.get('challengeToken') || undefined,
  })

  if (!queryParse.success) {
    return NextResponse.json(
      { success: false, error: queryParse.error.issues[0]?.message || 'Invalid query' },
      { status: 400 }
    )
  }

  const { word, challengeToken } = queryParse.data
  const normalized = word.toLowerCase().trim()

  const tier = getTierForRequest(identity.isAuthenticated ? identity.sessionKey : null)
  const rateDecision = await applyRateLimit({
    route: 'pronunciation',
    tier,
    key: identity.sessionKey,
  })

  if (!rateDecision.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Please wait a moment and try again.' },
      {
        status: 429,
        headers: {
          ...rateDecision.headers,
          'Retry-After': String(rateDecision.retryAfterSeconds),
        },
      }
    )
  }

  const risk = await assessRisk({
    identityKey: identity.sessionKey,
    userAgent: identity.userAgent,
    word: normalized,
    shortWindowCount: rateDecision.shortWindowCount,
    shortWindowLimit: RATE_LIMIT_POLICY.routes.pronunciation[tier].shortWindowLimit,
    isAuthenticated: tier === 'authenticated',
  })

  if (risk.requiresChallenge && isChallengeConfigured()) {
    if (!challengeToken) {
      return NextResponse.json(
        { success: false, error: 'Challenge required for this request' },
        { status: 403, headers: rateDecision.headers }
      )
    }

    const verified = await verifyChallengeToken(challengeToken, identity.ip)
    if (!verified) {
      return NextResponse.json(
        { success: false, error: 'Challenge verification failed' },
        { status: 403, headers: rateDecision.headers }
      )
    }
  }

  if (!isElevenLabsConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Pronunciation service not configured' },
      { status: 503, headers: rateDecision.headers }
    )
  }

  // Check cache first
  try {
    const cached = await getCachedAudio(normalized)
    if (cached) {
      const buffer = Buffer.from(cached, 'base64')
      return new NextResponse(buffer, {
        headers: {
          ...rateDecision.headers,
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=31536000',
          'X-Cache': 'HIT',
        },
      })
    }
  } catch (error) {
    console.error('[Pronunciation] Cache read error:', safeErrorMessage(error))
  }

  const costMode = await getCostMode()
  const mode = env.featureFlags.forceCacheOnly ? 'cache_only' : costMode.mode
  if (mode === 'blocked' || mode === 'cache_only') {
    return NextResponse.json(
      { success: false, error: 'Pronunciation is temporarily unavailable in current cost mode' },
      {
        status: 503,
        headers: {
          ...rateDecision.headers,
          'Retry-After': '900',
          'X-Cost-Mode': mode,
        },
      }
    )
  }

  const budgetDecision = await reserveDailyRequestBudget('pronunciation')
  if (!budgetDecision.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'Pronunciation is temporarily unavailable due to daily request budget limits',
      },
      {
        status: 503,
        headers: {
          ...rateDecision.headers,
          'Retry-After': String(secondsUntilNextUtcDay()),
        },
      }
    )
  }

  // Generate pronunciation
  try {
    const audioBuffer = await generatePronunciation(normalized)
    const base64 = Buffer.from(audioBuffer).toString('base64')

    cacheAudio(normalized, base64).catch(() => {
      // Cache failures are non-blocking for served response
    })

    return new NextResponse(Buffer.from(audioBuffer), {
      headers: {
        ...rateDecision.headers,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000',
        'X-Cache': 'MISS',
        'X-Cost-Mode': mode,
      },
    })
  } catch (error) {
    console.error('[Pronunciation] Generation failed:', safeErrorMessage(error))
    return NextResponse.json(
      { success: false, error: 'Failed to generate pronunciation' },
      { status: 500, headers: rateDecision.headers }
    )
  }
}
