import { unstable_cache } from 'next/cache'
import { ETYMOLOGY_SCAN_PATTERN, lexemeFromEtymologyCacheKey } from '@/lib/cache'
import { safeError } from '@/lib/errorUtils'
import type { LanguageCode } from '@/lib/languages'
import { getRedis } from '@/lib/redis'
import { isValidWord } from '@/lib/validation'

// Cap on collected words: the SCAN stops once this many are found, which
// bounds both the sitemap size and the /words index page.
const MAX_TRACED_WORDS = 1000
const SCAN_BATCH_SIZE = 200

export interface TracedWord {
  language: LanguageCode
  word: string
}

/**
 * Collect words with cached etymology entries by cursor-scanning Redis keys
 * under the versioned etymology prefixes. Fails open to an empty (or partial)
 * list so the pages built from it still render.
 */
async function scanTracedWords(): Promise<TracedWord[]> {
  const redis = getRedis()
  if (!redis) return []

  const words = new Map<string, TracedWord>()
  let cursor = '0'
  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: ETYMOLOGY_SCAN_PATTERN,
        count: SCAN_BATCH_SIZE,
      })
      cursor = String(nextCursor)
      for (const key of keys) {
        const lexeme = lexemeFromEtymologyCacheKey(key)
        if (lexeme && isValidWord(lexeme.word)) {
          words.set(`${lexeme.language}:${lexeme.word}`, lexeme)
        }
        if (words.size >= MAX_TRACED_WORDS) {
          return Array.from(words.values())
        }
      }
    } while (cursor !== '0')
  } catch (error) {
    console.error('[TracedWords] Redis scan failed:', safeError(error))
  }
  return Array.from(words.values())
}

/**
 * Every traced word, refreshed daily. unstable_cache keeps the Upstash
 * client's no-store fetches from flipping callers to dynamic rendering.
 * Callers must copy before sorting: the cache may hand back a shared array.
 */
export const getTracedWords = unstable_cache(scanTracedWords, ['traced-words'], {
  revalidate: 86400,
})
