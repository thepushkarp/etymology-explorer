/**
 * Scrapes etymology data from Etymonline.
 * Note: This is fragile as HTML structure may change.
 * Always implement graceful fallback.
 */

export interface EtymonlineResult {
  text: string
  url: string
}

/**
 * Fetch etymology text from Etymonline
 * @param word - The word to look up
 * @returns Object with text and URL, or null if not found/failed
 */
export async function fetchEtymonline(word: string): Promise<EtymonlineResult | null> {
  const normalizedWord = word.toLowerCase().trim().replace(/\s+/g, '-')
  const url = `https://www.etymonline.com/word/${encodeURIComponent(normalizedWord)}`

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'EtymologyExplorer/1.0 (educational project)',
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return null // Word not found
      }
      console.error(`Etymonline error: ${response.status}`)
      return null
    }

    const html = await response.text()

    // Extract the etymology text from the page
    // Look for the main content section - try multiple patterns
    const patterns = [
      /<section[^>]*class="[^"]*word__defination[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
      /<div[^>]*class="[^"]*word--C9UPa[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*word_entry[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<p[^>]*class="[^"]*word__definition[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match) {
        return { text: stripHtml(match[1]), url }
      }
    }

    // Fallback: try to find any paragraph with etymology content
    const fallbackMatch = html.match(/<p[^>]*>([\s\S]*?from[\s\S]*?)<\/p>/i)
    if (fallbackMatch) {
      return { text: stripHtml(fallbackMatch[1]), url }
    }

    return null
  } catch (error) {
    console.error('Etymonline fetch error:', error)
    return null
  }
}

/**
 * Remove HTML tags and clean up text
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace nbsp
    .replace(/&amp;/g, '&') // Replace amp
    .replace(/&lt;/g, '<') // Replace lt
    .replace(/&gt;/g, '>') // Replace gt
    .replace(/&quot;/g, '"') // Replace quot
    .replace(/&#39;/g, "'") // Replace apostrophe
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .slice(0, 2000) // Limit length
}
