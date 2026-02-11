/**
 * Fetches etymology section from Wiktionary for a given word.
 * Uses the MediaWiki API to get page content.
 */

import { fetchWithTimeout } from './fetchUtils'
import { safeError } from './errorUtils'
import { CONFIG } from './config'

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

/**
 * Fetch raw etymology text from Wiktionary
 * @param word - The word to look up
 * @returns Object with text and URL, or null if not found
 */
export async function fetchWiktionary(word: string): Promise<WiktionaryResult | null> {
  const normalizedWord = word.toLowerCase().trim()
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
    const response = await fetchWithTimeout(
      url.toString(),
      {
        headers: {
          'User-Agent': 'EtymologyExplorer/1.0 (educational project)',
        },
      },
      CONFIG.timeouts.source
    )

    if (!response.ok) {
      console.error(`Wiktionary API error: ${response.status}`)
      return null
    }

    const data: WiktionaryResponse = await response.json()
    const pages = data.query?.pages

    if (!pages) return null

    // Get the first (and usually only) page
    const pageId = Object.keys(pages)[0]
    const page = pages[pageId]

    if (page.missing || !page.extract) {
      return null
    }

    // Extract just the etymology section if present
    const extract = page.extract
    const etymologyMatch = extract.match(/Etymology[\s\S]*?(?=\n\n[A-Z]|\n\nPronunciation|$)/i)
    const text = etymologyMatch ? etymologyMatch[0].trim() : extract.slice(0, 1000)

    return { text, url: pageUrl }
  } catch (error) {
    console.error('Wiktionary fetch error:', safeError(error))
    return null
  }
}
