import 'server-only'

import { Redis } from '@upstash/redis'
import { getServerEnv } from '@/lib/server/env'

let client: Redis | null | undefined

export function getRedisClient(): Redis | null {
  if (client !== undefined) return client

  const env = getServerEnv()
  if (!env.hasRedis || !env.redisUrl || !env.redisToken) {
    client = null
    return client
  }

  client = new Redis({
    url: env.redisUrl,
    token: env.redisToken,
  })

  return client
}

export function isRedisConfigured(): boolean {
  return getRedisClient() !== null
}
