import type { MetadataRoute } from 'next'
import { unstable_cache } from 'next/cache'
import { ETYMOLOGY_SCAN_PATTERN, lexemeFromEtymologyCacheKey } from '@/lib/cache'
import { safeError } from '@/lib/errorUtils'
import { getRedis } from '@/lib/redis'
import { SITE_ORIGIN } from '@/lib/site'
import { isValidWord } from '@/lib/validation'
import { japaneseEntryPath, wordPagePath, type LanguageCode } from '@/lib/languages'
import { getCachedJapaneseResult, JAPANESE_RESULT_PREFIX } from '@/lib/japanese/cache'

export const revalidate = 86400

// Cap sitemap size: SCAN stops once this many cached words are collected
const MAX_WORD_ENTRIES = 1000
const SCAN_BATCH_SIZE = 200

/**
 * Collect words with cached etymology entries by cursor-scanning Redis keys
 * under the versioned etymology prefix. Fails open to an empty list so the
 * static sitemap entries always ship.
 */
interface CachedLexeme {
  language: LanguageCode
  word: string
  entryId?: string
}

async function scanCachedWords(): Promise<CachedLexeme[]> {
  const redis = getRedis()
  if (!redis) return []

  const words = new Map<string, CachedLexeme>()
  let cursor = '0'
  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: ETYMOLOGY_SCAN_PATTERN,
        count: SCAN_BATCH_SIZE,
      })
      cursor = String(nextCursor)
      for (const key of keys) {
        if (key.startsWith(JAPANESE_RESULT_PREFIX)) {
          const entryId = key.slice(JAPANESE_RESULT_PREFIX.length)
          const result = await getCachedJapaneseResult(entryId)
          if (result && isValidWord(result.word)) {
            words.set(`ja:${entryId}`, { language: 'ja', word: result.word, entryId })
          }
          continue
        }
        const lexeme = lexemeFromEtymologyCacheKey(key)
        if (lexeme && isValidWord(lexeme.word)) {
          words.set(`${lexeme.language}:${lexeme.word}`, lexeme)
        }
        if (words.size >= MAX_WORD_ENTRIES) {
          return Array.from(words.values())
        }
      }
    } while (cursor !== '0')
  } catch (error) {
    console.error('[Sitemap] Redis scan failed:', safeError(error))
  }
  return Array.from(words.values())
}

// unstable_cache keeps the Upstash client's no-store fetches from flipping
// the sitemap route to dynamic; the word list revalidates daily.
const getCachedWords = unstable_cache(scanCachedWords, ['sitemap-cached-words'], {
  revalidate: 86400,
})

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_ORIGIN,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_ORIGIN}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_ORIGIN}/learn/what-is-etymology`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ]

  const words = await getCachedWords()
  // Copy before sorting: unstable_cache may hand back a shared in-memory array
  const wordEntries: MetadataRoute.Sitemap = [...words]
    .sort((a, b) => `${a.language}:${a.word}`.localeCompare(`${b.language}:${b.word}`))
    .map(({ language, word, entryId }) => ({
      url: `${SITE_ORIGIN}${entryId ? japaneseEntryPath(word, entryId) : wordPagePath(word, language)}`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    }))

  return [...staticEntries, ...wordEntries]
}
