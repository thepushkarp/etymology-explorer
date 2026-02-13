/**
 * Fetches supplementary slang/community context from incels.wiki.
 * Uses MediaWiki Action API extracts endpoint.
 */

import { fetchWithTimeout } from './fetchUtils'
import { safeError } from './errorUtils'
import { CONFIG } from './config'
import type { SourceData } from './types'

const INCELS_WIKI_API = 'https://incels.wiki/api.php'
const MIN_EXTRACT_CHARS = 40

interface IncelsWikiResponse {
  query?: {
    pages?: {
      [key: string]: {
        title?: string
        extract?: string
        missing?: boolean
      }
    }
  }
}

function buildPageUrl(title: string): string {
  return `https://incels.wiki/w/${encodeURIComponent(title.replace(/\s+/g, '_'))}`
}

function normalizeExtract(text: string): string {
  return text.replace(/\r\n/g, '\n').trim()
}

/**
 * Fetch supplementary source text from incels.wiki.
 * Returns null on misses/errors (fail-open).
 */
export async function fetchIncelsWiki(word: string): Promise<SourceData | null> {
  const normalizedWord = word.toLowerCase().trim()

  const url = new URL(INCELS_WIKI_API)
  url.searchParams.set('action', 'query')
  url.searchParams.set('titles', normalizedWord)
  url.searchParams.set('prop', 'extracts')
  url.searchParams.set('explaintext', 'true')
  url.searchParams.set('exchars', '1200')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')

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

    if (!response.ok) return null

    const data: IncelsWikiResponse = await response.json()
    const pages = data.query?.pages
    if (!pages) return null

    const pageId = Object.keys(pages)[0]
    const page = pages[pageId]

    if (page?.missing || !page?.extract) return null

    const text = normalizeExtract(page.extract)
    if (text.length < MIN_EXTRACT_CHARS) return null

    const pageTitle = page.title ?? normalizedWord
    return {
      text,
      url: buildPageUrl(pageTitle),
    }
  } catch (error) {
    console.error('Incels Wiki fetch error:', safeError(error))
    return null
  }
}
