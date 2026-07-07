import { describe, expect, test } from 'bun:test'
import {
  tryAcquireLock,
  releaseLock,
  startLockHeartbeat,
  isLockHeld,
  markLockFailure,
  getLockFailure,
  attemptPromotion,
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

describe('holder failure vs holder crash (promotion state machine)', () => {
  test('holder failure: waiters get the error and never promote or re-run', async () => {
    const redis = createInMemoryRedis()

    // Holder acquires, fails, writes the marker, then releases (route order).
    const holder = await tryAcquireLock(LOCK_KEY, redis)
    if (holder.status !== 'acquired') throw new Error('setup failed')
    await markLockFailure(LOCK_KEY, 'OpenRouter request timeout after 120000ms', redis)
    await releaseLock(LOCK_KEY, holder.token, redis)

    // Every waiter surfaces the failure; none acquires the lock.
    for (let waiter = 0; waiter < 3; waiter++) {
      const promotion = await attemptPromotion(LOCK_KEY, redis)
      expect(promotion).toEqual({
        status: 'holder_failed',
        message: 'OpenRouter request timeout after 120000ms',
      })
    }
    expect(await isLockHeld(LOCK_KEY, redis)).toBe(false) // no one re-ran the pipeline
  })

  test('true crash: lock expired with no marker — exactly one waiter promotes', async () => {
    const redis = createInMemoryRedis()
    await tryAcquireLock(LOCK_KEY, redis)
    redis.advanceClock(91_000) // holder crashed; lock TTL expired, no marker

    const first = await attemptPromotion(LOCK_KEY, redis)
    const second = await attemptPromotion(LOCK_KEY, redis)

    expect(first.status).toBe('promoted')
    expect(second.status).toBe('held') // lost the race — keeps polling
  })

  test('holder still working: waiters keep polling', async () => {
    const redis = createInMemoryRedis()
    await tryAcquireLock(LOCK_KEY, redis)

    expect(await attemptPromotion(LOCK_KEY, redis)).toEqual({ status: 'held' })
  })

  test('marker written between check and acquisition: lock is handed back', async () => {
    const redis = createInMemoryRedis()

    // Lock is free and unmarked at first check, but the failed holder's
    // marker becomes visible by the post-acquisition re-check.
    await markLockFailure(LOCK_KEY, 'synthesis failed', redis)

    const promotion = await attemptPromotion(LOCK_KEY, redis)

    expect(promotion).toEqual({ status: 'holder_failed', message: 'synthesis failed' })
    expect(await isLockHeld(LOCK_KEY, redis)).toBe(false)
  })

  test('a failed promoted waiter cannot cascade into further promotions', async () => {
    const redis = createInMemoryRedis()
    await tryAcquireLock(LOCK_KEY, redis)
    redis.advanceClock(91_000) // original holder truly crashed

    const promoted = await attemptPromotion(LOCK_KEY, redis)
    if (promoted.status !== 'promoted') throw new Error('setup failed')

    // The promoted waiter's pipeline fails too: marker, then release.
    await markLockFailure(LOCK_KEY, 'still failing', redis)
    await releaseLock(LOCK_KEY, promoted.token, redis)

    expect(await attemptPromotion(LOCK_KEY, redis)).toEqual({
      status: 'holder_failed',
      message: 'still failing',
    })
  })

  test('marker expires so later fresh requests are not blocked forever', async () => {
    const redis = createInMemoryRedis()
    await markLockFailure(LOCK_KEY, 'transient provider error', redis)

    redis.advanceClock(61_000) // past the 60s marker TTL

    expect(await getLockFailure(LOCK_KEY, redis)).toBeNull()
    expect((await attemptPromotion(LOCK_KEY, redis)).status).toBe('promoted')
  })

  test('first failure message wins (marker is SET NX)', async () => {
    const redis = createInMemoryRedis()
    await markLockFailure(LOCK_KEY, 'first error', redis)
    await markLockFailure(LOCK_KEY, 'second error', redis)

    expect(await getLockFailure(LOCK_KEY, redis)).toBe('first error')
  })
})
