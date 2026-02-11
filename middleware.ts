import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { CONFIG } from '@/lib/config'
import { getRedis } from '@/lib/redis'

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
  // On Vercel, x-forwarded-for and x-real-ip are overwritten by the trusted
  // edge proxy and cannot be spoofed by clients. For non-Vercel deployments,
  // place a reverse proxy (e.g. nginx, Cloudflare) in front that overwrites
  // these headers — otherwise clients can rotate IPs to bypass rate limits.
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

  const response = NextResponse.next()

  // CSP in report-only mode — switch to enforcing after confirming no breakage
  response.headers.set(
    'Content-Security-Policy-Report-Only',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com; " +
      "style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; " +
      "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  )

  return response
}

export const config = {
  matcher: '/api/:path*',
}
