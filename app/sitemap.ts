import type { MetadataRoute } from 'next'
import { unstable_cache } from 'next/cache'
import { ETYMOLOGY_PREFIX } from '@/lib/cache'
import { safeError } from '@/lib/errorUtils'
import { getRedis } from '@/lib/redis'
import { SITE_ORIGIN } from '@/lib/site'
import { isValidWord } from '@/lib/validation'

export const revalidate = 86400

// Cap sitemap size: SCAN stops once this many cached words are collected
const MAX_WORD_ENTRIES = 1000
const SCAN_BATCH_SIZE = 200

/**
 * Collect words with cached etymology entries by cursor-scanning Redis keys
 * under the versioned etymology prefix. Fails open to an empty list so the
 * static sitemap entries always ship.
 */
async function scanCachedWords(): Promise<string[]> {
  const redis = getRedis()
  if (!redis) return []

  const words = new Set<string>()
  let cursor = '0'
  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: `${ETYMOLOGY_PREFIX}*`,
        count: SCAN_BATCH_SIZE,
      })
      cursor = String(nextCursor)
      for (const key of keys) {
        const word = key.slice(ETYMOLOGY_PREFIX.length)
        if (isValidWord(word)) {
          words.add(word)
        }
        if (words.size >= MAX_WORD_ENTRIES) {
          return Array.from(words)
        }
      }
    } while (cursor !== '0')
  } catch (error) {
    console.error('[Sitemap] Redis scan failed:', safeError(error))
  }
  return Array.from(words)
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
  const wordEntries: MetadataRoute.Sitemap = words.sort().map((word) => ({
    url: `${SITE_ORIGIN}/word/${encodeURIComponent(word)}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  return [...staticEntries, ...wordEntries]
}
