/**
 * Fetches etymology section from Wiktionary for a given word.
 * Uses the MediaWiki API to get page content.
 */

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

/**
 * Fetch raw etymology text from Wiktionary
 * @param word - The word to look up
 * @returns Raw etymology text or null if not found
 */
export async function fetchWiktionary(word: string): Promise<string | null> {
  const normalizedWord = word.toLowerCase().trim()

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
    })

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

    return etymologyMatch ? etymologyMatch[0].trim() : extract.slice(0, 1000)
  } catch (error) {
    console.error('Wiktionary fetch error:', error)
    return null
  }
}
