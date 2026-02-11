/**
 * Shared Redis client factory.
 * Returns null if Redis is not configured (all callers fail open).
 */

import { Redis } from '@upstash/redis'

export function getRedis(): Redis | null {
  if (!process.env.ETYMOLOGY_KV_REST_API_URL || !process.env.ETYMOLOGY_KV_REST_API_TOKEN) {
    return null
  }
  return new Redis({
    url: process.env.ETYMOLOGY_KV_REST_API_URL,
    token: process.env.ETYMOLOGY_KV_REST_API_TOKEN,
  })
}
