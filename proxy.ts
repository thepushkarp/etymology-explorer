import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { CONFIG } from '@/lib/config'
import { getRedis } from '@/lib/redis'

// Lazily initialized rate limiters (only created if Redis is configured)
let etymologyLimiter: Ratelimit | null = null
let etymologyDailyLimiter: Ratelimit | null = null
let pronunciationLimiter: Ratelimit | null = null
let generalLimiter: Ratelimit | null = null

const AGENT_DISCOVERY_LINKS = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</openapi.json>; rel="service-desc"; type="application/openapi+json"',
  '</docs/api>; rel="service-doc"',
  '</.well-known/agent-skills/index.json>; rel="describedby"; type="application/json"',
].join(', ')

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
  // Trust Vercel's x-forwarded-for — Vercel's edge proxy overwrites this header,
  // so it's reliable whether or not Cloudflare is in the path.
  // Do NOT trust cf-connecting-ip: it can be forged if the origin is hit directly.
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

function buildHomepageMarkdown(origin: string): string {
  return [
    '# Etymology Explorer',
    '',
    'Discover the roots and origins of words with grounded etymological evidence.',
    '',
    `- Home: ${origin}/`,
    `- API docs: ${origin}/docs/api`,
    `- API catalog: ${origin}/.well-known/api-catalog`,
    `- Agent skills index: ${origin}/.well-known/agent-skills/index.json`,
    '',
    'Core endpoint:',
    '',
    '- `GET /api/etymology?word=<word>`',
    '',
    'Use `?stream=true` for streaming synthesis responses.',
  ].join('\n')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/' && request.method === 'GET') {
    const accept = request.headers.get('accept') ?? ''
    if (accept.includes('text/markdown')) {
      const markdown = buildHomepageMarkdown(request.nextUrl.origin)
      const approxTokens = Math.max(1, Math.ceil(markdown.length / 4))

      return new NextResponse(markdown, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          Link: AGENT_DISCOVERY_LINKS,
          Vary: 'Accept',
          'x-markdown-tokens': String(approxTokens),
        },
      })
    }
  }

  if (pathname.startsWith('/api/')) {
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

    if (CONFIG.features.rateLimitEnabled) {
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
    }
  }

  const response = NextResponse.next()

  // CSP enforced for API responses
  if (pathname.startsWith('/api/')) {
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com; " +
        "style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
  }

  if (pathname === '/') {
    response.headers.set('Link', AGENT_DISCOVERY_LINKS)
    response.headers.append('Vary', 'Accept')
  }

  return response
}

export const config = {
  matcher: ['/', '/api/:path*'],
}
