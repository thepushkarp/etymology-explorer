import { canonicalizeWord, sameSpelling } from './orthography'
import type { SourceData, SourceFetchOutcome } from './types'
import { decodeHtmlEntities, preserveLinguisticNotation } from './sourceText'
import { fetchWithTimeout } from './fetchUtils'
import { CONFIG } from './config'
import { getCachedSource, cacheSource } from './sourceCache'
import { sourceFailure, sourceHttpFailure } from './sourceOutcome'

export type EtymonlineResult = SourceData

const RELATION_DESC_SIGNALS =
  /\b(from|root|cognate|latin|greek|french|english|german|proto|pie|borrowed|derived)\b/i
const STOP_WORDS = new Set(['the', 'and', 'for', 'from', 'with', 'word'])
const ETYMOLOGY_SIGNALS = /\bfrom\b|\d{4}s?|\d{1,2}c\.|Latin|Greek|French|Old English|German/i
const ENTRY_CLASSES = ['prose-lg', 'word__defination', 'word_entry']

function entryWord(heading: string): string {
  return stripHtml(heading)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
}

function isChallenge(html: string): boolean {
  return /cf-chl-|cf_chl_|challenges\.cloudflare\.com|<title>\s*Just a moment|Verify you are human|Performing security verification/i.test(
    html
  )
}

/** Retain complete source-defined entries, excluding adjacent headwords and related cards. */
function parseEtymonlineHtml(word: string, html: string, recovered: boolean): SourceData | null {
  if (isChallenge(html) || html.includes('NEXT_HTTP_ERROR_FALLBACK;404')) return null
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  const headword = heading?.match(/<em\b[^>]*>([\s\S]*?)<\/em>/i)?.[1] ?? heading
  if (headword && !sameSpelling(entryWord(headword), word)) return null
  const headings = [...html.matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
  const entries: Array<{ heading: string; text: string }> = []
  let incomplete = false
  for (let index = 0; index < headings.length; index++) {
    const current = headings[index]
    if (current[1] !== '2' || !sameSpelling(entryWord(current[2]), word)) continue
    const next = headings[index + 1]
    const body = html.slice(current.index! + current[0].length, next?.index ?? html.length)
    const containers = ENTRY_CLASSES.map((className) =>
      extractEntryContainers(body, className)
    ).find((fragments) => fragments.length > 0)
    // Exa can flatten related entries into unlabeled paragraphs. An open-ended
    // recovered body cannot prove where this headword ends, even with a correct URL.
    if (!next && !containers) {
      incomplete = true
      continue
    }
    const text = (containers ?? [body]).map(stripHtml).join('\n\n').trim()
    if (text && ETYMOLOGY_SIGNALS.test(text)) entries.push({ heading: stripHtml(current[2]), text })
    else incomplete = true
  }
  if (!entries.length && !headings.some((match) => match[1] === '2') && !recovered) {
    const containers = ENTRY_CLASSES.map((className) =>
      extractEntryContainers(html, className)
    ).find((fragments) => fragments.length > 0)
    const text = containers?.map(stripHtml).join('\n\n').trim()
    if (text && ETYMOLOGY_SIGNALS.test(text)) entries.push({ heading: word, text })
  }
  if (!entries.length) return null
  const url = `https://www.etymonline.com/word/${encodeURIComponent(word)}`
  return {
    text: entries.map((entry) => entry.text).join('\n\n'),
    url,
    requestedWord: word,
    resolvedWord: word,
    language: 'en',
    lexicalLanguage: 'English',
    sourceFamily: 'etymonline',
    evidenceRole: 'etymology',
    ...(incomplete ? { incomplete: true } : {}),
    relatedEntries: extractEtymonlineRelatedEntries(html, word),
    entryGroups: entries.map((entry, index) => ({
      index: String(index + 1),
      number: String(index + 1),
      heading: entry.heading,
      anchor: `etymonline-${index + 1}`,
      level: 2,
      text: entry.text,
      sections: [],
      sourceUrl: url,
    })),
  }
}

/** Exa is a transport; only an exact publisher URL with recoverable entry boundaries is evidence. */
export function parseRecoveredEtymonline(
  word: string,
  document: { url: string; text: string; title?: string }
): SourceData | null {
  const normalized = canonicalizeWord(word)
  try {
    const url = new URL(document.url)
    if (
      url.protocol !== 'https:' ||
      !['www.etymonline.com', 'etymonline.com'].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      !url.pathname.startsWith('/word/') ||
      !sameSpelling(decodeURIComponent(url.pathname.slice('/word/'.length)), normalized)
    )
      return null
  } catch {
    return null
  }
  return parseEtymonlineHtml(normalized, document.text, true)
}

export async function fetchEtymonlineOutcome(
  word: string,
  signal?: AbortSignal,
  options: { skipDirect?: boolean } = {}
): Promise<SourceFetchOutcome> {
  const normalizedWord = canonicalizeWord(word)
  signal?.throwIfAborted()
  const cached = await getCachedSource('etymonline', normalizedWord)
  signal?.throwIfAborted()
  if (cached) return { status: 'found', data: cached }
  if (options.skipDirect) {
    return {
      status: 'blocked',
      reason: 'Etymonline requires the browser challenge already observed during this trace',
    }
  }
  const url = `https://www.etymonline.com/word/${encodeURIComponent(normalizedWord)}`
  try {
    const response = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': 'EtymologyExplorer/1.0 (educational project)' } },
      CONFIG.timeouts.source,
      signal
    )
    if (!response.ok) return sourceHttpFailure(response, 'Etymonline')
    const html = await response.text()
    if (isChallenge(html))
      return { status: 'blocked', reason: 'Etymonline returned a browser challenge' }
    if (html.includes('NEXT_HTTP_ERROR_FALLBACK;404')) return { status: 'not_found' }
    const data = parseEtymonlineHtml(normalizedWord, html, false)
    if (!data)
      return { status: 'no_evidence', reason: 'Etymonline returned no matching, bounded entry' }
    if (!data.incomplete) await cacheSource('etymonline', normalizedWord, data)
    return { status: 'found', data }
  } catch (error) {
    return sourceFailure(error, signal)
  }
}

export async function fetchEtymonline(
  word: string,
  signal?: AbortSignal
): Promise<EtymonlineResult | null> {
  const outcome = await fetchEtymonlineOutcome(word, signal)
  return outcome.status === 'found' ? outcome.data : null
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
  const content = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  return decodeHtmlEntities(preserveLinguisticNotation(content).replace(/<[^>]*>/g, ' '))
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
