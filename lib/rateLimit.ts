import type { NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { CONFIG } from '@/lib/config'
import { getRedis } from '@/lib/redis'

export type LimiterName = keyof typeof CONFIG.rateLimit
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

export function getClientIp(request: NextRequest): string {
  // Trust Vercel's x-forwarded-for — Vercel's edge proxy overwrites this header,
  // so it's reliable whether or not Cloudflare is in the path.
  // Do NOT trust cf-connecting-ip: it can be forged if the origin is hit directly.
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function checkRateLimits(
  request: NextRequest,
  names: readonly LimiterName[]
): Promise<{ retryAfter: number } | null> {
  if (!CONFIG.features.rateLimitEnabled) return null
  const active = names.map(getLimiter).filter((limiter): limiter is Ratelimit => limiter !== null)
  if (active.length === 0) return null
  const ip = getClientIp(request)
  const results = await Promise.all(active.map((limiter) => limiter.limit(ip)))
  const blocked = results.find((result) => !result.success)
  if (!blocked) return null
  const retryAfter = Math.ceil((blocked.reset - Date.now()) / 1000)
  return { retryAfter: Math.max(retryAfter, 1) }
}
