import { cacheSource, getCachedSource } from '@/lib/cache'
import { TIMEOUT_POLICY } from '@/lib/config/guardrails'
import { SourceData } from './types'

const WIKIPEDIA_REST_API = 'https://en.wikipedia.org/api/rest_v1/page/summary'

export async function fetchWikipedia(word: string): Promise<SourceData | null> {
  const normalizedWord = word.toLowerCase().trim()
  const cached = await getCachedSource('wikipedia', normalizedWord)
  if (cached) {
    return cached
  }

  try {
    const response = await fetch(`${WIKIPEDIA_REST_API}/${encodeURIComponent(normalizedWord)}`, {
      headers: { 'User-Agent': 'EtymologyExplorer/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_POLICY.externalFetchMs),
    })

    if (!response.ok) return null

    const data = await response.json()

    if (data.type === 'disambiguation' || !data.extract) {
      return null
    }

    const result = {
      text: data.extract,
      url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${normalizedWord}`,
    }

    await cacheSource('wikipedia', normalizedWord, result)
    return result
  } catch {
    return null
  }
}
