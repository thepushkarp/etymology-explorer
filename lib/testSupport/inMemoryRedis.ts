/**
 * In-memory Redis test double with TTL support and an injectable clock.
 * Implements the minimal surface used by lib/singleflight.ts and
 * lib/costGuard.ts. Only imported from *.test.ts files.
 */

interface StoredEntry {
  value: string
  expiresAt: number | null // epoch ms, null = no TTL
}

export interface InMemoryRedis {
  set(key: string, value: string, opts?: { nx?: true; ex?: number }): Promise<'OK' | null>
  get(key: string): Promise<unknown>
  del(key: string): Promise<number>
  exists(key: string): Promise<number>
  expire(key: string, seconds: number, option?: 'nx'): Promise<0 | 1>
  incrbyfloat(key: string, value: number): Promise<number>
  incr(key: string): Promise<number>
  mget(...keys: string[]): Promise<(unknown | null)[]>
  pipeline(): InMemoryPipeline
  /** Test helpers */
  ttlMs(key: string): number | null
  advanceClock(ms: number): void
  now(): number
}

export interface InMemoryPipeline {
  incrbyfloat(key: string, value: number): InMemoryPipeline
  incr(key: string): InMemoryPipeline
  expire(key: string, seconds: number, option?: 'nx'): InMemoryPipeline
  exec(): Promise<unknown[]>
}

export function createInMemoryRedis(): InMemoryRedis {
  const store = new Map<string, StoredEntry>()
  let clockOffset = 0

  const now = () => Date.now() + clockOffset

  const liveEntry = (key: string): StoredEntry | null => {
    const entry = store.get(key)
    if (!entry) return null
    if (entry.expiresAt !== null && entry.expiresAt <= now()) {
      store.delete(key)
      return null
    }
    return entry
  }

  const redis: InMemoryRedis = {
    async set(key, value, opts) {
      if (opts?.nx && liveEntry(key)) return null
      store.set(key, {
        value,
        expiresAt: opts?.ex !== undefined ? now() + opts.ex * 1000 : null,
      })
      return 'OK'
    },

    async get(key) {
      const entry = liveEntry(key)
      if (!entry) return null
      // Mirror @upstash/redis behavior: numbers deserialize to numbers.
      const numeric = Number(entry.value)
      return entry.value !== '' && Number.isFinite(numeric) ? numeric : entry.value
    },

    async del(key) {
      return liveEntry(key) && store.delete(key) ? 1 : 0
    },

    async exists(key) {
      return liveEntry(key) ? 1 : 0
    },

    async expire(key, seconds, option) {
      const entry = liveEntry(key)
      if (!entry) return 0
      if (option === 'nx' && entry.expiresAt !== null) return 0
      entry.expiresAt = now() + seconds * 1000
      return 1
    },

    async incrbyfloat(key, value) {
      const entry = liveEntry(key)
      const next = (entry ? Number(entry.value) : 0) + value
      store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null })
      return next
    },

    async incr(key) {
      const entry = liveEntry(key)
      const next = (entry ? Number(entry.value) : 0) + 1
      store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null })
      return next
    },

    async mget(...keys) {
      return Promise.all(keys.map((key) => redis.get(key)))
    },

    pipeline() {
      const operations: (() => Promise<unknown>)[] = []
      const pipe: InMemoryPipeline = {
        incrbyfloat(key, value) {
          operations.push(() => redis.incrbyfloat(key, value))
          return pipe
        },
        incr(key) {
          operations.push(() => redis.incr(key))
          return pipe
        },
        expire(key, seconds, option) {
          operations.push(() => redis.expire(key, seconds, option))
          return pipe
        },
        async exec() {
          const results: unknown[] = []
          for (const operation of operations) {
            results.push(await operation())
          }
          return results
        },
      }
      return pipe
    },

    ttlMs(key) {
      const entry = liveEntry(key)
      if (!entry || entry.expiresAt === null) return null
      return entry.expiresAt - now()
    },

    advanceClock(ms) {
      clockOffset += ms
    },

    now,
  }

  return redis
}

/** A client whose every operation rejects — simulates Redis being down. */
export function createFailingRedis(): InMemoryRedis {
  const fail = () => Promise.reject(new Error('redis connection refused'))
  return {
    set: fail,
    get: fail,
    del: fail,
    exists: fail,
    expire: fail,
    incrbyfloat: fail,
    incr: fail,
    mget: fail,
    pipeline() {
      const pipe: InMemoryPipeline = {
        incrbyfloat: () => pipe,
        incr: () => pipe,
        expire: () => pipe,
        exec: fail,
      }
      return pipe
    },
    ttlMs: () => null,
    advanceClock: () => {},
    now: () => Date.now(),
  }
}
