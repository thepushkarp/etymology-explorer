import { canonicalizeWord, sameSpelling } from './orthography'
import type { SourceData } from './types'
import { decodeHtmlEntities, preserveLinguisticNotation } from './sourceText'
/**
 * Scrapes etymology data from Etymonline.
 * Note: This is fragile as HTML structure may change.
 * Always implement graceful fallback.
 */

import { fetchWithTimeout } from './fetchUtils'
import { safeError } from './errorUtils'
import { CONFIG } from './config'
import { getCachedSource, cacheSource } from './sourceCache'

export type EtymonlineResult = SourceData

const RELATION_DESC_SIGNALS =
  /\b(from|root|cognate|latin|greek|french|english|german|proto|pie|borrowed|derived)\b/i
const STOP_WORDS = new Set(['the', 'and', 'for', 'from', 'with', 'word'])

/**
 * Fetch etymology text from Etymonline (7d Redis source cache in front)
 * @param word - The word to look up
 * @param signal - Optional caller cancellation signal (e.g. client disconnect)
 * @returns Object with text and URL, or null if not found/failed
 */
export async function fetchEtymonline(
  word: string,
  signal?: AbortSignal
): Promise<EtymonlineResult | null> {
  const normalizedWord = canonicalizeWord(word)
  const url = `https://www.etymonline.com/word/${encodeURIComponent(normalizedWord)}`

  const cached = await getCachedSource('etymonline', normalizedWord)
  if (cached) return cached

  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent': 'EtymologyExplorer/1.0 (educational project)',
        },
      },
      CONFIG.timeouts.source,
      signal
    )

    if (!response.ok) {
      if (response.status === 404) {
        return null // Word not found
      }
      console.error(`Etymonline error: ${response.status}`)
      return null
    }

    const html = await response.text()
    const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    const headword = heading?.match(/<em\b[^>]*>([\s\S]*?)<\/em>/i)?.[1] ?? heading
    if (
      headword &&
      !sameSpelling(stripHtml(headword).replace(/\s*\([^)]*\)\s*$/, ''), normalizedWord)
    )
      return null

    // Check if this is a 404 page (Etymonline returns 200 with fallback content)
    if (html.includes('NEXT_HTTP_ERROR_FALLBACK;404')) {
      return null
    }

    // Extract the etymology text from the page
    // Look for the main content section - Etymonline uses prose-lg class for etymology content
    for (const className of ['prose-lg', 'word__defination', 'word_entry']) {
      const fragments = extractEntryContainers(html, className)
      const text = fragments.map(stripHtml).join('\n\n')
      if (text && /\d{4}s?|Latin|Greek|French|Old English|German/i.test(text)) {
        const result = {
          text,
          url,
          requestedWord: normalizedWord,
          resolvedWord: normalizedWord,
          language: 'en' as const,
          relatedEntries: extractEtymonlineRelatedEntries(html, normalizedWord),
        }
        void cacheSource('etymonline', normalizedWord, result)
        return result
      }
    }

    // Fallback: look for paragraphs with clear etymology markers
    // Use <p\b to avoid matching <path>, <param>, etc.
    // Require a date pattern like "1590s" or "16c." to ensure it's etymology
    const datePattern = /\b\d{4}s?\b|\b\d{1,2}c\./
    const fallbackMatch = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)
    if (fallbackMatch) {
      const admitted = fallbackMatch.filter(
        (p) => datePattern.test(stripHtml(p)) && /\bfrom\b/i.test(stripHtml(p))
      )
      if (admitted.length) {
        const result = {
          text: admitted.map(stripHtml).join('\n\n'),
          url,
          requestedWord: normalizedWord,
          resolvedWord: normalizedWord,
          language: 'en' as const,
          relatedEntries: extractEtymonlineRelatedEntries(html, normalizedWord),
        }
        void cacheSource('etymonline', normalizedWord, result)
        return result
      }
    }

    return null
  } catch (error) {
    console.error('Etymonline fetch error:', safeError(error))
    return null
  }
}

export function extractEtymonlineRelatedEntries(html: string, excludeWord: string): string[] {
  const relatedTerms = new Map<string, number>()
  const excludeLower = excludeWord.toLowerCase()
  const pattern = /\\"word\\":\\"([^"]+)\\"[^{}]*?\\"desc\\":\\"([^"]+)\\"/g

  for (const match of html.matchAll(pattern)) {
    const rawTerm = match[1]?.trim()
    const desc = match[2] ?? ''
    const normalizedTerm = rawTerm?.toLowerCase()

    if (!normalizedTerm) continue
    if (normalizedTerm === excludeLower || STOP_WORDS.has(normalizedTerm)) continue
    if (normalizedTerm.length < 3 && !normalizedTerm.startsWith('*')) continue

    const score =
      (relatedTerms.get(normalizedTerm) ?? 0) + (RELATION_DESC_SIGNALS.test(desc) ? 3 : 1)

    relatedTerms.set(normalizedTerm, score)
  }

  return [...relatedTerms.entries()].sort((left, right) => right[1] - left[1]).map(([term]) => term)
}

/**
 * Remove HTML tags and clean up text
 */
function stripHtml(html: string): string {
  return decodeHtmlEntities(preserveLinguisticNotation(html).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
}

/** Balance nested container tags rather than ending at the first inner div. */
function extractEntryContainers(html: string, className: string): string[] {
  const fragments: string[] = []
  const openings = /<(section|div)\b[^>]*class=["']([^"']*)["'][^>]*>/gi
  let consumed = -1
  for (const opening of html.matchAll(openings)) {
    if (opening.index < consumed || !opening[2].split(/\s+/).includes(className)) continue
    const start = opening.index + opening[0].length
    const tags = new RegExp(`<(/?)${opening[1]}\\b[^>]*>`, 'gi')
    tags.lastIndex = start
    let depth = 1
    let tag
    while ((tag = tags.exec(html))) {
      depth += tag[1] ? -1 : 1
      if (depth === 0) {
        fragments.push(html.slice(start, tag.index))
        consumed = tags.lastIndex
        break
      }
    }
  }
  return fragments
}
