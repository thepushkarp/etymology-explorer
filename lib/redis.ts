/**
 * Shared Redis client factory.
 * Returns null if Redis is not configured. Callers decide their failure
 * policy: most fail open, but uncached etymology synthesis fails closed
 * (see app/api/etymology/route.ts) because running without Redis means
 * no budget enforcement, no dedup, and no caching.
 */

import { Redis } from '@upstash/redis'

let client: Redis | null | undefined

export function getRedis(): Redis | null {
  if (client !== undefined) return client

  if (!process.env.ETYMOLOGY_KV_REST_API_URL || !process.env.ETYMOLOGY_KV_REST_API_TOKEN) {
    client = null
    return client
  }

  client = new Redis({
    url: process.env.ETYMOLOGY_KV_REST_API_URL,
    token: process.env.ETYMOLOGY_KV_REST_API_TOKEN,
  })
  return client
}
