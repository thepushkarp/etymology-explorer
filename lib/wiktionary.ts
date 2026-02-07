/**
 * Fetches etymology section from Wiktionary for a given word.
 * Uses the MediaWiki API to get page content.
 */

import { cacheSource, getCachedSource } from '@/lib/cache'
import { TIMEOUT_POLICY } from '@/lib/config/guardrails'
import type { SourceFetchStatus } from '@/lib/types'

interface WiktionaryResponse {
  query?: {
    pages?: {
      [key: string]: {
        extract?: string
        missing?: boolean
      }
    }
  }
}

export interface WiktionaryResult {
  text: string
  url: string
}

export interface WiktionaryFetchResult {
  status: SourceFetchStatus
  data: WiktionaryResult | null
}

/**
 * Fetch raw etymology text from Wiktionary
 * @param word - The word to look up
 * @returns fetch result with status and data payload
 */
export async function fetchWiktionaryWithStatus(word: string): Promise<WiktionaryFetchResult> {
  const normalizedWord = word.toLowerCase().trim()
  const cached = await getCachedSource('wiktionary', normalizedWord)
  if (cached) {
    return {
      status: 'ok',
      data: cached,
    }
  }

  const pageUrl = `https://en.wiktionary.org/wiki/${encodeURIComponent(normalizedWord)}`

  // Wiktionary API endpoint - get plain text extract
  const url = new URL('https://en.wiktionary.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('titles', normalizedWord)
  url.searchParams.set('prop', 'extracts')
  url.searchParams.set('explaintext', 'true')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*') // CORS

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'EtymologyExplorer/1.0 (educational project)',
      },
      signal: AbortSignal.timeout(TIMEOUT_POLICY.externalFetchMs),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return {
          status: 'not_found',
          data: null,
        }
      }

      return {
        status: 'error',
        data: null,
      }
    }

    const data: WiktionaryResponse = await response.json()
    const pages = data.query?.pages

    if (!pages) {
      return {
        status: 'error',
        data: null,
      }
    }

    // Get the first (and usually only) page
    const pageId = Object.keys(pages)[0]
    const page = pages[pageId]

    if (page.missing || !page.extract) {
      return {
        status: 'not_found',
        data: null,
      }
    }

    // Extract just the etymology section if present
    const extract = page.extract
    const etymologyMatch = extract.match(/Etymology[\s\S]*?(?=\n\n[A-Z]|\n\nPronunciation|$)/i)
    const text = etymologyMatch ? etymologyMatch[0].trim() : extract.slice(0, 1000)

    const result = { text, url: pageUrl }
    await cacheSource('wiktionary', normalizedWord, result)
    return {
      status: 'ok',
      data: result,
    }
  } catch {
    return {
      status: 'error',
      data: null,
    }
  }
}

export async function fetchWiktionary(word: string): Promise<WiktionaryResult | null> {
  const result = await fetchWiktionaryWithStatus(word)
  return result.data
}
