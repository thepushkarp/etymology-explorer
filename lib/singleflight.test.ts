import { describe, expect, test } from 'bun:test'
import {
  tryAcquireLock,
  releaseLock,
  startLockHeartbeat,
  isLockHeld,
  pollForResult,
} from '@/lib/singleflight'
import { createInMemoryRedis, createFailingRedis } from '@/lib/testSupport/inMemoryRedis'

const LOCK_KEY = 'lock:etymology:test-word'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('tryAcquireLock', () => {
  test('acquires a free lock and returns an owner token', async () => {
    const redis = createInMemoryRedis()

    const acquisition = await tryAcquireLock(LOCK_KEY, redis)

    expect(acquisition.status).toBe('acquired')
    if (acquisition.status !== 'acquired') throw new Error('unreachable')
    expect(acquisition.token.length).toBeGreaterThan(0)
    expect(await isLockHeld(LOCK_KEY, redis)).toBe(true)
  })

  test('reports busy while another request holds the lock', async () => {
    const redis = createInMemoryRedis()
    await tryAcquireLock(LOCK_KEY, redis)

    const second = await tryAcquireLock(LOCK_KEY, redis)

    expect(second.status).toBe('busy')
  })

  test('sets a TTL so a crashed holder cannot deadlock the word', async () => {
    const redis = createInMemoryRedis()
    await tryAcquireLock(LOCK_KEY, redis)

    const ttl = redis.ttlMs(LOCK_KEY)
    expect(ttl).not.toBeNull()
    expect(ttl!).toBeGreaterThan(0)
  })

  test('waiter can promote itself after the holder lock expires', async () => {
    const redis = createInMemoryRedis()
    await tryAcquireLock(LOCK_KEY, redis)

    redis.advanceClock(91_000) // past the 90s TTL — holder crashed

    expect(await isLockHeld(LOCK_KEY, redis)).toBe(false)
    const promotion = await tryAcquireLock(LOCK_KEY, redis)
    expect(promotion.status).toBe('acquired')
  })

  test('returns unavailable when Redis is not configured', async () => {
    expect(await tryAcquireLock(LOCK_KEY, null)).toEqual({ status: 'unavailable' })
  })

  test('returns error when Redis rejects', async () => {
    expect(await tryAcquireLock(LOCK_KEY, createFailingRedis())).toEqual({ status: 'error' })
  })
})

describe('releaseLock owner-token safety', () => {
  test('releases the lock when the token matches', async () => {
    const redis = createInMemoryRedis()
    const acquisition = await tryAcquireLock(LOCK_KEY, redis)
    if (acquisition.status !== 'acquired') throw new Error('setup failed')

    await releaseLock(LOCK_KEY, acquisition.token, redis)

    expect(await isLockHeld(LOCK_KEY, redis)).toBe(false)
  })

  test('does NOT release a lock owned by someone else', async () => {
    const redis = createInMemoryRedis()
    const first = await tryAcquireLock(LOCK_KEY, redis)
    if (first.status !== 'acquired') throw new Error('setup failed')

    // First holder's lock expires; a second request acquires it.
    redis.advanceClock(91_000)
    const second = await tryAcquireLock(LOCK_KEY, redis)
    if (second.status !== 'acquired') throw new Error('setup failed')

    // Stale first holder tries to release with its old token — must be a no-op.
    await releaseLock(LOCK_KEY, first.token, redis)

    expect(await isLockHeld(LOCK_KEY, redis)).toBe(true)
  })
})

describe('startLockHeartbeat', () => {
  test('extends the lock TTL while running and stops when cleared', async () => {
    const redis = createInMemoryRedis()
    const acquisition = await tryAcquireLock(LOCK_KEY, redis)
    if (acquisition.status !== 'acquired') throw new Error('setup failed')

    // Move to 5s before expiry, then let the heartbeat refresh the TTL.
    redis.advanceClock(85_000)
    const stop = startLockHeartbeat(LOCK_KEY, acquisition.token, {
      intervalMs: 10,
      ttlSeconds: 90,
      client: redis,
    })
    await sleep(40)
    stop()

    const ttl = redis.ttlMs(LOCK_KEY)
    expect(ttl).not.toBeNull()
    expect(ttl!).toBeGreaterThan(80_000) // refreshed back to ~90s

    // After stop, the TTL keeps draining without refreshes.
    redis.advanceClock(91_000)
    expect(await isLockHeld(LOCK_KEY, redis)).toBe(false)
  })

  test('does not extend a lock that changed hands', async () => {
    const redis = createInMemoryRedis()
    const first = await tryAcquireLock(LOCK_KEY, redis)
    if (first.status !== 'acquired') throw new Error('setup failed')

    // First holder's lock expires and a new holder takes over.
    redis.advanceClock(91_000)
    const second = await tryAcquireLock(LOCK_KEY, redis)
    if (second.status !== 'acquired') throw new Error('setup failed')
    const ttlBefore = redis.ttlMs(LOCK_KEY)

    // Stale heartbeat with the old token must not touch the new lock.
    const stop = startLockHeartbeat(LOCK_KEY, first.token, {
      intervalMs: 10,
      ttlSeconds: 3600,
      client: redis,
    })
    await sleep(40)
    stop()

    const ttlAfter = redis.ttlMs(LOCK_KEY)
    expect(ttlAfter!).toBeLessThanOrEqual(ttlBefore!)
  })
})

describe('pollForResult', () => {
  test('returns the result once the holder caches it', async () => {
    let cached: string | null = null
    setTimeout(() => {
      cached = 'the-result'
    }, 25)

    const result = await pollForResult(() => Promise.resolve(cached), {
      intervalMs: 10,
      maxWaitMs: 500,
    })

    expect(result).toBe('the-result')
  })

  test('returns null when nothing appears within the wait budget', async () => {
    const result = await pollForResult(() => Promise.resolve(null), {
      intervalMs: 10,
      maxWaitMs: 50,
    })

    expect(result).toBeNull()
  })
})

describe('isLockHeld', () => {
  test('assumes held on Redis errors so waiters do not stampede', async () => {
    expect(await isLockHeld(LOCK_KEY, createFailingRedis())).toBe(true)
  })
})
