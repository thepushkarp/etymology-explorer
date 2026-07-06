/**
 * Fetches etymology section from Wiktionary for a given word.
 * Uses the MediaWiki API to get page content.
 */

import { fetchWithTimeout } from './fetchUtils'
import { safeError } from './errorUtils'
import { CONFIG } from './config'
import { getCachedSource, cacheSource } from './sourceCache'

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
 * Extract the Etymology subsection(s) of the English language section from a
 * plaintext MediaWiki extract (exsectionformat=wiki: "== English ==" headings).
 *
 * Wiktionary pages cover every language that spells the word this way; the
 * broad fallback regex happily returns a Danish or Latin etymology when the
 * English one is what the pipeline needs. Returns null when no English
 * Etymology section is found so the caller can fall back.
 */
export function extractEnglishEtymology(extract: string): string | null {
  const englishHeading = extract.match(/^==\s*English\s*==\s*$/m)
  if (englishHeading?.index === undefined) return null

  const sectionStart = englishHeading.index + englishHeading[0].length
  const rest = extract.slice(sectionStart)
  const nextLanguage = rest.match(/^==[^=\n][^\n]*==\s*$/m)
  const englishSection = nextLanguage ? rest.slice(0, nextLanguage.index) : rest

  // Collect "=== Etymology ===" / "=== Etymology 1 ===" subsections (any depth).
  const sections: string[] = []
  const headingPattern = /^={3,}\s*Etymology(?:\s+\d+)?\s*={3,}\s*$/gim
  let match
  while ((match = headingPattern.exec(englishSection)) !== null) {
    const bodyStart = match.index + match[0].length
    const body = englishSection.slice(bodyStart)
    const nextHeading = body.match(/^=+[^=\n][^\n]*=+\s*$/m)
    const section = (nextHeading ? body.slice(0, nextHeading.index) : body).trim()
    if (section.length > 0) {
      sections.push(section)
    }
    if (sections.length >= 2) break // Etymology 1 + 2 cover polysemous words
  }

  return sections.length > 0 ? sections.join('\n\n') : null
}

/**
 * Fetch raw etymology text from Wiktionary (7d Redis source cache in front)
 * @param word - The word to look up
 * @param signal - Optional caller cancellation signal (e.g. client disconnect)
 * @returns Object with text and URL, or null if not found
 */
export async function fetchWiktionary(
  word: string,
  signal?: AbortSignal
): Promise<WiktionaryResult | null> {
  const normalizedWord = word.toLowerCase().trim()
  const pageUrl = `https://en.wiktionary.org/wiki/${encodeURIComponent(normalizedWord)}`

  const cached = await getCachedSource('wiktionary', normalizedWord)
  if (cached) return cached

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
      CONFIG.timeouts.source,
      signal
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

    // Prefer the English Etymology section; fall back to the old broad match
    const extract = page.extract
    const englishEtymology = extractEnglishEtymology(extract)
    const etymologyMatch = extract.match(/Etymology[\s\S]*?(?=\n\n[A-Z]|\n\nPronunciation|$)/i)
    const text =
      englishEtymology ?? (etymologyMatch ? etymologyMatch[0].trim() : extract.slice(0, 1000))

    const result = { text, url: pageUrl }
    void cacheSource('wiktionary', normalizedWord, result)
    return result
  } catch (error) {
    console.error('Wiktionary fetch error:', safeError(error))
    return null
  }
}
