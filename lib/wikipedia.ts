import { SourceData } from './types'

const WIKIPEDIA_REST_API = 'https://en.wikipedia.org/api/rest_v1/page/summary'

export async function fetchWikipedia(word: string): Promise<SourceData | null> {
  try {
    const response = await fetch(`${WIKIPEDIA_REST_API}/${encodeURIComponent(word)}`, {
      headers: { 'User-Agent': 'EtymologyExplorer/1.0' },
    })

    if (!response.ok) return null

    const data = await response.json()

    if (data.type === 'disambiguation' || !data.extract) {
      return null
    }

    return {
      text: data.extract,
      url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${word}`,
    }
  } catch {
    return null
  }
}
