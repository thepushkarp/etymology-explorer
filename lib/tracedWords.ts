import { unstable_cache } from 'next/cache'
import {
  ENTRY_PREFIX,
  ENTRY_SCAN_PATTERN,
  LEGACY_ETYMOLOGY_PREFIX,
  LEGACY_BETA_ETYMOLOGY_PREFIX,
  LEGACY_SCAN_PATTERNS,
  getCachedEntry,
} from '@/lib/cache'
import { safeError } from '@/lib/errorUtils'
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/languages'
import { canonicalizeWord } from '@/lib/orthography'
import { getRedis } from '@/lib/redis'
import { isValidWord } from '@/lib/validation'

const MAX_TRACED_WORDS = 1000
const SCAN_BATCH_SIZE = 200
// SCAN may return no keys with a nonzero cursor; bound network work too.
const MAX_SCAN_BATCHES_PER_PREFIX = 100

export interface TracedWord {
  word: string
}

function wordFromCacheKey(key: string): string | null {
  if (key.startsWith(ENTRY_PREFIX)) return key.slice(ENTRY_PREFIX.length)
  if (key.startsWith(LEGACY_ETYMOLOGY_PREFIX)) return key.slice(LEGACY_ETYMOLOGY_PREFIX.length)
  if (!key.startsWith(LEGACY_BETA_ETYMOLOGY_PREFIX)) return null
  const suffix = key.slice(LEGACY_BETA_ETYMOLOGY_PREFIX.length)
  const separator = suffix.indexOf(':')
  if (
    !SUPPORTED_LANGUAGE_CODES.some(
      (language) => language !== 'en' && language === suffix.slice(0, separator)
    )
  )
    return null
  return suffix.slice(separator + 1)
}

/** Migrate discovered legacy words before their original thirty-day TTL expires. */
async function migrateLegacyWords(words: Set<string>): Promise<void> {
  const pending = [...words]
  let index = 0
  await Promise.all(
    Array.from({ length: Math.min(4, pending.length) }, async () => {
      while (index < pending.length) await getCachedEntry(pending[index++])
    })
  )
}

/** Corpus discovery also durably preserves unvisited legacy entries without research calls. */
export async function scanTracedWords(): Promise<TracedWord[]> {
  const redis = getRedis()
  if (!redis) return []
  const words = new Map<string, TracedWord>()
  const durable = new Set<string>()
  const legacy = new Set<string>()
  async function finish(): Promise<TracedWord[]> {
    await migrateLegacyWords(legacy)
    return Array.from(words.values())
  }
  for (const pattern of [ENTRY_SCAN_PATTERN, ...LEGACY_SCAN_PATTERNS]) {
    let cursor = '0'
    let batches = 0
    try {
      do {
        const [nextCursor, keys] = await redis.scan(cursor, {
          match: pattern,
          count: SCAN_BATCH_SIZE,
        })
        cursor = String(nextCursor)
        for (const key of keys) {
          const word = wordFromCacheKey(key)
          if (word && isValidWord(word)) {
            const normalized = canonicalizeWord(word)
            words.set(normalized, { word: normalized })
            if (key.startsWith(ENTRY_PREFIX)) durable.add(normalized)
            else if (!durable.has(normalized)) legacy.add(normalized)
          }
          if (words.size >= MAX_TRACED_WORDS) return finish()
        }
        batches++
      } while (cursor !== '0' && batches < MAX_SCAN_BATCHES_PER_PREFIX)
    } catch (error) {
      console.error('[TracedWords] Redis scan failed:', safeError(error))
    }
  }
  return finish()
}

/** Daily corpus snapshot; callers must copy the shared cached array before sorting. */
export const getTracedWords = unstable_cache(scanTracedWords, ['traced-words', ENTRY_PREFIX], {
  revalidate: 86400,
})
