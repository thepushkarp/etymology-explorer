import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '@/lib/site'
import { wordPagePath } from '@/lib/languages'
import { getTracedWords } from '@/lib/tracedWords'

export const revalidate = 86400

// No lastModified: cached results carry no timestamp, and a lastmod that is
// always "now" teaches crawlers to ignore the field for the whole site.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_ORIGIN, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_ORIGIN}/words`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_ORIGIN}/faq`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_ORIGIN}/learn/what-is-etymology`, changeFrequency: 'monthly', priority: 0.7 },
  ]

  const words = await getTracedWords()
  const wordEntries: MetadataRoute.Sitemap = [...words]
    .sort((a, b) => `${a.language}:${a.word}`.localeCompare(`${b.language}:${b.word}`))
    .map(({ language, word }) => ({
      url: `${SITE_ORIGIN}${wordPagePath(word, language)}`,
      changeFrequency: 'monthly',
      priority: 0.6,
    }))

  return [...staticEntries, ...wordEntries]
}
