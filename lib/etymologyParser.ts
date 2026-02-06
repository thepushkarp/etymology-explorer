/**
 * Pre-parses etymology text from Etymonline and Wiktionary into structured chains.
 * Extracts "from X, from Y" chains before the LLM call so the LLM validates
 * rather than invents ancestry stages.
 *
 * Strategy: multi-pass parsing (not one giant regex)
 * 1. Split text on "from " boundaries
 * 2. Match each segment against KNOWN_LANGUAGES
 * 3. Extract form (up to first comma/quote)
 * 4. Extract meaning from quotes
 * 5. Detect *-prefix for reconstructed (PIE) forms
 */

export interface ParsedEtymLink {
  language: string // "Latin", "Old French", "Proto-Indo-European"
  form: string // "perfidia", "*bheid-"
  meaning?: string // "faithlessness"
  isReconstructed: boolean // true for PIE *-prefixed forms
  rawSnippet: string // exact substring from source that yielded this
}

export interface ParsedEtymChain {
  source: 'etymonline' | 'wiktionary'
  word: string
  links: ParsedEtymLink[] // ordered modern → oldest
  dateAttested?: string // "1590s"
}

/**
 * Known language names for matching against etymology text.
 * Ordered longest-first so "Old French" matches before "French".
 */
const KNOWN_LANGUAGES = [
  'Proto-Indo-European',
  'Proto-Germanic',
  'Proto-Italic',
  'Proto-Celtic',
  'Proto-Slavic',
  'Middle English',
  'Old English',
  'Old French',
  'Old Norse',
  'Old High German',
  'Middle French',
  'Middle Dutch',
  'Middle Low German',
  'Medieval Latin',
  'Late Latin',
  'Vulgar Latin',
  'Classical Latin',
  'Modern English',
  'Modern French',
  'Ancient Greek',
  'Koine Greek',
  'New Latin',
  'Church Latin',
  'Anglo-French',
  'Latin',
  'Greek',
  'French',
  'German',
  'Spanish',
  'Italian',
  'Portuguese',
  'Dutch',
  'Swedish',
  'Danish',
  'Norwegian',
  'Sanskrit',
  'Arabic',
  'Hebrew',
  'Persian',
  'Turkish',
  'Japanese',
  'Chinese',
  'Celtic',
  'Gaelic',
  'Welsh',
  'PIE',
]

/**
 * Build a regex that matches any known language name at the start of a string.
 * Case-insensitive, requires word boundary after the name.
 */
const LANGUAGE_PATTERN = new RegExp(
  `^(${KNOWN_LANGUAGES.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i'
)

/**
 * Extract the attested date from etymology text (e.g., "1590s", "late 14c.", "c. 1600")
 */
function extractDate(text: string): string | undefined {
  const dateMatch = text.match(
    /\b(early|mid|late|c\.\s*)?\d{4}s?\b|\b(early|mid|late)\s+\d{1,2}c\./i
  )
  return dateMatch ? dateMatch[0] : undefined
}

/**
 * Extract meaning from quoted text following a form.
 * Handles both single and double quotes, and parenthesized meanings.
 */
function extractMeaning(text: string): string | undefined {
  // Match "meaning", 'meaning', or (meaning)
  const patterns = [
    /[""\u201c]([^""\u201d]+)[""\u201d]/, // double quotes (incl. smart quotes)
    /[''\u2018]([^''\u2019]+)[''\u2019]/, // single quotes (incl. smart quotes)
    /\(([^)]+)\)/, // parenthesized
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1].length < 100) {
      return match[1].trim()
    }
  }
  return undefined
}

/**
 * Extract the word form from a segment after the language name.
 * The form is typically the next word(s) before a comma, quote, or parenthesis.
 */
function extractForm(text: string): string | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined

  // Match a word form: could start with * (reconstructed), may include hyphens and diacritics
  // Stop at comma, quote, parenthesis, semicolon, or "meaning"
  const formMatch = trimmed.match(/^(\*?[\w\u00C0-\u024F*-]+(?:\s*\([^)]*\))?)/)
  if (formMatch) {
    return formMatch[1].trim()
  }
  return undefined
}

/**
 * Parse a single "from ..." segment into a ParsedEtymLink.
 * Returns null if the segment doesn't contain a recognizable language.
 */
function parseSegment(segment: string): ParsedEtymLink | null {
  const trimmed = segment.trim()

  // Try to match a known language at the start
  const langMatch = trimmed.match(LANGUAGE_PATTERN)
  if (!langMatch) return null

  const language = normalizeLanguageName(langMatch[1])
  let afterLang = trimmed.slice(langMatch[0].length).trim()

  // Check for PIE root marker
  const isPIERoot = /PIE root\b/i.test(segment) || language === 'Proto-Indo-European'

  // Skip the literal "root" token when it precedes a *-prefixed form
  // e.g., "PIE root *bheid-" → afterLang was "root *bheid-", skip "root" to get "*bheid-"
  afterLang = afterLang.replace(/^root\s+(?=\*)/, '')

  // Extract form from the text after the language name
  const form = extractForm(afterLang)
  if (!form) return null

  // Extract meaning from the remainder
  const meaning = extractMeaning(afterLang)

  // Detect reconstructed forms: starts with * or is PIE
  const isReconstructed = form.startsWith('*') || isPIERoot

  // Build a raw snippet (cap at 120 chars, trim to word boundary)
  let rawSnippet = `from ${trimmed}`.slice(0, 120)
  if (rawSnippet.length === 120) {
    const lastSpace = rawSnippet.lastIndexOf(' ')
    if (lastSpace > 80) rawSnippet = rawSnippet.slice(0, lastSpace) + '...'
  }

  return {
    language,
    form,
    meaning,
    isReconstructed,
    rawSnippet,
  }
}

/**
 * Normalize language name variations to canonical form.
 */
function normalizeLanguageName(name: string): string {
  const lower = name.toLowerCase()
  if (lower === 'pie') return 'Proto-Indo-European'
  // Capitalize first letter of each word
  return name.replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Split text into "from ..." segments.
 * Handles both "from Latin ..." and "from PIE root *..." patterns.
 */
function splitFromSegments(text: string): string[] {
  // Split on "from " that's preceded by whitespace, comma, semicolon, or start
  const segments: string[] = []
  const pattern = /(?:^|[,;\s])\s*from\s+/gi
  let lastIndex = 0
  let match

  while ((match = pattern.exec(text)) !== null) {
    const segStart = match.index + match[0].length
    if (segments.length > 0) {
      // The previous segment ends where this "from" starts
      segments[segments.length - 1] = text.slice(lastIndex, match.index).trim()
    }
    segments.push('') // placeholder for this segment
    lastIndex = segStart
  }

  // Close out the last segment
  if (segments.length > 0) {
    segments[segments.length - 1] = text.slice(lastIndex).trim()
  }

  return segments
}

/**
 * Shared parsing logic for both Etymonline and Wiktionary text.
 * Both sources use similar "from X, from Y" chain patterns.
 */
function parseSourceText(
  text: string,
  word: string,
  source: 'etymonline' | 'wiktionary'
): ParsedEtymChain {
  const dateAttested = extractDate(text)
  const segments = splitFromSegments(text)

  const links: ParsedEtymLink[] = []
  for (const segment of segments) {
    const link = parseSegment(segment)
    if (link) {
      links.push(link)
    }
  }

  return { source, word, links, dateAttested }
}

/**
 * Parse Etymonline text into a structured etymology chain.
 * Etymonline follows patterns like:
 *   "from Latin perfidia 'faithlessness, falsehood, treachery,' from perfidus 'faithless'"
 */
export function parseEtymonlineText(text: string, word: string): ParsedEtymChain {
  return parseSourceText(text, word, 'etymonline')
}

/**
 * Parse Wiktionary text into a structured etymology chain.
 * Wiktionary uses similar "from" patterns but also has:
 *   "Borrowed from French X, from Latin Y" and parenthesized meanings.
 */
export function parseWiktionaryText(text: string, word: string): ParsedEtymChain {
  return parseSourceText(text, word, 'wiktionary')
}

/**
 * Convenience wrapper: parse both Etymonline and Wiktionary texts.
 * Returns only chains that have at least one parsed link.
 */
export function parseSourceTexts(
  word: string,
  etymonlineText: string | null | undefined,
  wiktionaryText: string | null | undefined
): ParsedEtymChain[] {
  const chains: ParsedEtymChain[] = []

  if (etymonlineText) {
    const chain = parseEtymonlineText(etymonlineText, word)
    if (chain.links.length > 0) {
      chains.push(chain)
    }
  }

  if (wiktionaryText) {
    const chain = parseWiktionaryText(wiktionaryText, word)
    if (chain.links.length > 0) {
      chains.push(chain)
    }
  }

  return chains
}

/**
 * Format parsed chains into a human-readable string for the LLM prompt.
 * This gets appended to the research data so the LLM can use parsed chains
 * as ground truth for ancestry stages.
 */
export function formatParsedChainsForPrompt(chains: ParsedEtymChain[]): string {
  if (chains.length === 0) return ''

  const sections: string[] = [
    '=== Pre-Parsed Etymology Chains ===',
    '(Extracted from source text. Use as ground truth for ancestry stages.)',
    '',
  ]

  for (const chain of chains) {
    sections.push(`--- Chain from ${chain.source} ---`)
    if (chain.dateAttested) {
      sections.push(`First attested: ${chain.dateAttested}`)
    }

    for (const link of chain.links) {
      let line = `  ${link.language}: ${link.form}`
      if (link.meaning) {
        line += ` "${link.meaning}"`
      }
      if (link.isReconstructed) {
        line += ' [RECONSTRUCTED]'
      }
      sections.push(line)
    }
    sections.push('')
  }

  return sections.join('\n')
}
