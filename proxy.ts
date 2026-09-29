import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { CONFIG } from '@/lib/config'
import { getRedis } from '@/lib/redis'
import { wordPagePath } from '@/lib/languages'
import { canonicalizeWord, isValidWord } from '@/lib/validation'

type LimiterName = keyof typeof CONFIG.rateLimit
type Window = `${number} ${'s' | 'm' | 'h' | 'd'}`

const LIMITER_PREFIX: Record<LimiterName, string> = {
  etymology: 'etym',
  etymologyDaily: 'etym-daily',
  pronunciation: 'pron',
  general: 'gen',
}

const limiters = new Map<LimiterName, Ratelimit>()

// Created lazily: null (no rate limiting) when Redis is not configured.
function getLimiter(name: LimiterName): Ratelimit | null {
  const existing = limiters.get(name)
  if (existing) return existing
  const redis = getRedis()
  if (!redis) return null
  const { requests, window } = CONFIG.rateLimit[name]
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window as Window),
    prefix: `${CONFIG.rateLimitPrefix}:${LIMITER_PREFIX[name]}`,
  })
  limiters.set(name, limiter)
  return limiter
}

function limitersFor(pathname: string): LimiterName[] {
  if (pathname === '/api/etymology') return ['etymology', 'etymologyDaily']
  if (pathname === '/api/pronunciation') return ['pronunciation']
  return ['general']
}

/** Legacy /?q=word deep links (and the JSON-LD SearchAction) → canonical word page. */
export function legacySearchRedirect(url: URL): string | null {
  if (url.pathname !== '/') return null
  const raw = url.searchParams.get('q')
  if (!raw) return null
  const word = canonicalizeWord(raw)
  return isValidWord(word) ? wordPagePath(word) : null
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const redirectPath = request.method === 'GET' ? legacySearchRedirect(request.nextUrl) : null
  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, request.nextUrl), 308)
  }

  if (pathname.startsWith('/api/') && CONFIG.features.rateLimitEnabled) {
    const ip = getClientIp(request)
    const active = limitersFor(pathname)
      .map(getLimiter)
      .filter((limiter): limiter is Ratelimit => limiter !== null)
    const results = await Promise.all(active.map((limiter) => limiter.limit(ip)))
    const blocked = results.find((result) => !result.success)

    if (blocked) {
      const retryAfter = Math.ceil((blocked.reset - Date.now()) / 1000)
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(Math.max(retryAfter, 1)) } }
      )
    }
  }

  const response = NextResponse.next()

  // CSP for every matched response (HTML pages and API alike).
  //
  // script-src uses 'unsafe-inline' rather than a hash or nonce because the
  // HTML pages are statically prerendered: Next.js bakes per-build
  // `self.__next_f.push(...)` inline flight scripts into the HTML, which
  // can't be hashed ahead of time, and nonces require dynamic rendering.
  // Adding a hash alongside 'unsafe-inline' would make CSP2+ browsers ignore
  // 'unsafe-inline' and break hydration. The policy still blocks scripts,
  // objects, and frames from external hosts.
  //
  // Vercel Analytics + Speed Insights load same-origin /_vercel/* scripts in
  // production (covered by 'self'); in dev they load debug scripts from
  // va.vercel-scripts.com, and the dev toolchain needs 'unsafe-eval' + ws:.
  const isDev = process.env.NODE_ENV === 'development'
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com"
    : "script-src 'self' 'unsafe-inline'"
  const connectSrc = isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'"
  const cspDirectives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https:",
    "media-src 'self'",
    connectSrc,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
  response.headers.set('Content-Security-Policy', cspDirectives.join('; '))

  return response
}

export const config = {
  // All pages and API routes; skip Next internals and static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|fonts/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|txt|xml|json|woff2?)$).*)',
  ],
}
