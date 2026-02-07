import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { CONFIG } from '@/lib/config'

function getRedis(): Redis | null {
  if (!process.env.ETYMOLOGY_KV_REST_API_URL || !process.env.ETYMOLOGY_KV_REST_API_TOKEN) {
    return null
  }
  return new Redis({
    url: process.env.ETYMOLOGY_KV_REST_API_URL,
    token: process.env.ETYMOLOGY_KV_REST_API_TOKEN,
  })
}

// Lazily initialized rate limiters (only created if Redis is configured)
let etymologyLimiter: Ratelimit | null = null
let etymologyDailyLimiter: Ratelimit | null = null
let pronunciationLimiter: Ratelimit | null = null
let generalLimiter: Ratelimit | null = null

function getEtymologyLimiter(): Ratelimit | null {
  if (etymologyLimiter) return etymologyLimiter
  const redis = getRedis()
  if (!redis) return null
  etymologyLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      CONFIG.rateLimit.etymology.requests,
      CONFIG.rateLimit.etymology.window as `${number} ${'s' | 'm' | 'h' | 'd'}`
    ),
    prefix: `${CONFIG.rateLimitPrefix}:etym`,
  })
  return etymologyLimiter
}

function getEtymologyDailyLimiter(): Ratelimit | null {
  if (etymologyDailyLimiter) return etymologyDailyLimiter
  const redis = getRedis()
  if (!redis) return null
  etymologyDailyLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      CONFIG.rateLimit.etymologyDaily.requests,
      CONFIG.rateLimit.etymologyDaily.window as `${number} ${'s' | 'm' | 'h' | 'd'}`
    ),
    prefix: `${CONFIG.rateLimitPrefix}:etym-daily`,
  })
  return etymologyDailyLimiter
}

function getPronunciationLimiter(): Ratelimit | null {
  if (pronunciationLimiter) return pronunciationLimiter
  const redis = getRedis()
  if (!redis) return null
  pronunciationLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      CONFIG.rateLimit.pronunciation.requests,
      CONFIG.rateLimit.pronunciation.window as `${number} ${'s' | 'm' | 'h' | 'd'}`
    ),
    prefix: `${CONFIG.rateLimitPrefix}:pron`,
  })
  return pronunciationLimiter
}

function getGeneralLimiter(): Ratelimit | null {
  if (generalLimiter) return generalLimiter
  const redis = getRedis()
  if (!redis) return null
  generalLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      CONFIG.rateLimit.general.requests,
      CONFIG.rateLimit.general.window as `${number} ${'s' | 'm' | 'h' | 'd'}`
    ),
    prefix: `${CONFIG.rateLimitPrefix}:gen`,
  })
  return generalLimiter
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip = getClientIp(request)

  // Select appropriate rate limiter(s) based on endpoint
  let limiters: (Ratelimit | null)[] = []

  if (pathname === '/api/etymology') {
    limiters = [getEtymologyLimiter(), getEtymologyDailyLimiter()]
  } else if (pathname === '/api/pronunciation') {
    limiters = [getPronunciationLimiter()]
  } else {
    limiters = [getGeneralLimiter()]
  }

  // Check all applicable rate limits
  for (const limiter of limiters) {
    if (!limiter) continue // Redis not configured — skip rate limiting

    const { success, reset } = await limiter.limit(ip)

    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000)
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please slow down.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(retryAfter, 1)),
          },
        }
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
