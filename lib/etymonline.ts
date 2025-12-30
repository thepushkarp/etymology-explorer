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

    // Check if this is a 404 page (Etymonline returns 200 with fallback content)
    if (html.includes('NEXT_HTTP_ERROR_FALLBACK;404')) {
      return null
    }

    // Extract the etymology text from the page
    // Look for the main content section - Etymonline uses prose-lg class for etymology content
    const patterns = [
      // Current Etymonline structure: prose-lg sections contain etymology
      /<section[^>]*class="[^"]*prose-lg[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
      // Older patterns as fallback
      /<section[^>]*class="[^"]*word__defination[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
      /<div[^>]*class="[^"]*word_entry[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match) {
        const text = stripHtml(match[1])
        // Verify this looks like etymology content (has date or language reference)
        if (/\d{4}s?|Latin|Greek|French|Old English|German/i.test(text)) {
          return { text, url }
        }
      }
    }

    // Fallback: look for paragraphs with clear etymology markers
    // Use <p\b to avoid matching <path>, <param>, etc.
    // Require a date pattern like "1590s" or "16c." to ensure it's etymology
    const datePattern = /\b\d{4}s?\b|\b\d{1,2}c\./
    const fallbackMatch = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)
    if (fallbackMatch) {
      for (const p of fallbackMatch) {
        const content = stripHtml(p)
        // Must have a date and "from" to be etymology content
        if (datePattern.test(content) && /\bfrom\b/i.test(content)) {
          return { text: content, url }
        }
      }
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
