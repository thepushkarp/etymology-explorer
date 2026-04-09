/**
 * Agentic research module for deep etymology exploration.
 * Conducts multi-source lookups to gather rich context about word origins
 * and constituent roots.
 */

import { fetchEtymonline } from './etymonline'
import { fetchWiktionary } from './wiktionary'
import { fetchWikipedia } from './wikipedia'
import { fetchUrbanDictionary } from './urbanDictionary'
import { fetchIncelsWiki } from './incelsWiki'
import { fetchFreeDictionary } from './freeDictionary'
import { RelatedTermResearchData, ResearchContext, RootResearchData, StreamEvent } from './types'
import { parseSourceTexts, formatParsedChainsForPrompt } from './etymologyParser'
import { CONFIG } from './config'
import { safeError } from './errorUtils'
import {
  buildRootExtractionRequest,
  createOpenAIResponse,
  extractOutputText,
} from './openaiResponses'

export async function extractRootsQuick(
  word: string,
  etymonlineText: string | null,
  wiktionaryText: string | null
): Promise<string[]> {
  const sourceText = [etymonlineText, wiktionaryText].filter(Boolean).join('\n\n')

  if (!sourceText) {
    return []
  }

  const prompt = `Analyze this etymology data and extract the ETYMOLOGICAL root morphemes of the word "${word}".

Rules:
- Extract roots that carry independent meaning and have their own etymology worth researching.
- Include prefixes only when they are productive and meaningfully change the word (for example, "contra-" in "contradict").
- Exclude inflectional or low-signal suffixes such as -ed, -ing, -ly, -tion, -ible, and -ous unless the source data makes them etymologically central.
- For single-morpheme words with no compound structure, return just the word itself.

Source data:
${sourceText}

Return ONLY a JSON array of root strings (the actual morphemes, not full words).
Examples:
- For "telephone": ["tele", "phone"]
- For "autobiography": ["auto", "bio", "graph"]
- For "incredible": ["cred"]
- For "contradict": ["contra", "dict"]
- For "cat": ["cat"]

Return the JSON array only, no explanation:`

  try {
    const request = buildRootExtractionRequest(prompt)
    request.instructions =
      'Extract root morphemes only. Return a JSON array of lowercase strings with no commentary.'

    const response = await createOpenAIResponse(request)
    return parseRootsArray(extractOutputText(response))
  } catch (error) {
    console.error('Root extraction error:', safeError(error))
    return []
  }
}

/**
 * Parse a JSON array of roots from LLM response
 */
function parseRootsArray(text: string): string[] {
  const normalizeRoots = (parsed: unknown): string[] => {
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((s) => s.toLowerCase().trim())
      .slice(0, CONFIG.maxRootsToExplore)
  }

  try {
    return normalizeRoots(JSON.parse(text))
  } catch {
    const jsonMatch = text.match(/\[[\s\S]*?\]/)
    if (!jsonMatch) return []

    try {
      return normalizeRoots(JSON.parse(jsonMatch[0]))
    } catch {
      return []
    }
  }
}

const TERM_PATTERN = /[\p{L}*][\p{L}*'’.-]*/gu
const LOW_SIGNAL_TERMS = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'word',
  'latin',
  'greek',
  'english',
  'french',
  'german',
  'middle',
  'old',
  'ancient',
  'proto',
  'indo-european',
])

function normalizeCandidateTerm(term: string): string | null {
  const normalized = term
    .toLowerCase()
    .trim()
    .replace(/[.,;:()]+$/g, '')
  if (!normalized) return null
  if (LOW_SIGNAL_TERMS.has(normalized)) return null
  if (normalized.length < 3 && !normalized.startsWith('*')) return null
  return normalized
}

/**
 * Extract related terms mentioned in source text
 */
export function extractRelatedTerms(
  text: string,
  excludeWords: string[],
  seedTerms: string[] = []
): string[] {
  const patterns = [
    /related to ([\p{L}*'’.-]+)/giu,
    /cognate with ([\p{L}*'’.-]+)/giu,
    /see also ([\p{L}*'’.-]+)/giu,
    /compare ([\p{L}*'’.-]+)/giu,
    /akin to ([\p{L}*'’.-]+)/giu,
    /ultimately (?:derived )?from [^.\n;:]*?([\p{L}*'’.-]+)/giu,
    /borrowed from [^.\n;:]*?([\p{L}*'’.-]+)/giu,
    /derived from [^.\n;:]*?([\p{L}*'’.-]+)/giu,
    /inherited from [^.\n;:]*?([\p{L}*'’.-]+)/giu,
    /from (\w+) ["']([\p{L}*'’.-]+)["']/giu,
  ]

  const scores = new Map<string, number>()
  const excludeLower = new Set(excludeWords.map((word) => word.toLowerCase()))

  const addCandidate = (term: string, score: number) => {
    const normalized = normalizeCandidateTerm(term)
    if (!normalized || excludeLower.has(normalized)) return
    scores.set(normalized, (scores.get(normalized) ?? 0) + score)
  }

  for (const term of seedTerms) {
    addCandidate(term, 5)
  }

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      for (const candidate of match.slice(1).filter(Boolean)) {
        for (const token of candidate.match(TERM_PATTERN) ?? []) {
          addCandidate(token, 3)
        }
      }
    }
  }

  const plusPattern =
    /(?:equivalent to|modelled after|modeled after)\s+([\p{L}*'’.-]+)\s*\+\s*([\p{L}*'’.-]+)/giu
  for (const match of text.matchAll(plusPattern)) {
    addCandidate(match[1], 4)
    addCandidate(match[2], 4)
  }

  for (const match of text.matchAll(/\*[\p{L}\d₀-₉ʰʷʸ'-]+/gu)) {
    addCandidate(match[0], 4)
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([term]) => term)
    .slice(0, CONFIG.maxRelatedWordsPerRoot)
}

/**
 * Fetch research data for a single root
 */
async function fetchRootResearch(root: string): Promise<RootResearchData> {
  const [etymonlineData, wiktionaryData] = await Promise.all([
    fetchEtymonline(root),
    fetchWiktionary(root),
  ])

  const combinedText = [etymonlineData?.text, wiktionaryData?.text].filter(Boolean).join(' ')
  const relatedTerms = extractRelatedTerms(
    combinedText,
    [root],
    etymonlineData?.relatedEntries ?? []
  )

  return {
    root,
    etymonlineData,
    wiktionaryData,
    relatedTerms,
  }
}

async function fetchRelatedTermResearch(term: string): Promise<RelatedTermResearchData> {
  const [etymonlineData, wiktionaryData] = await Promise.all([
    fetchEtymonline(term),
    fetchWiktionary(term),
  ])

  return {
    term,
    etymonlineData,
    wiktionaryData,
  }
}

/**
 * Emit a progress event safely (non-blocking)
 */
function emitProgress(callback: ((event: StreamEvent) => void) | undefined, event: StreamEvent) {
  if (!callback) return
  try {
    callback(event)
  } catch (error) {
    console.error('[Research] Progress callback error:', safeError(error))
  }
}

/**
 * Conduct agentic research to gather rich etymology context.
 * This is the main orchestrator that:
 * 1. Fetches initial word data
 * 2. Extracts roots using quick LLM call
 * 3. Fetches context for each root
 */
export async function conductAgenticResearch(
  word: string,
  options?: { skipOptionalSources?: boolean },
  onProgress?: (event: StreamEvent) => void
): Promise<ResearchContext> {
  let totalFetches = 0
  const normalizedWord = word.toLowerCase().trim()
  const skipOptional = options?.skipOptionalSources ?? false

  const runOptionalSource = <T>(
    source: string,
    startTime: number,
    fetcher: () => Promise<T | null>,
    preview: (data: T | null) => string | undefined
  ): Promise<T | null> => {
    return fetcher()
      .then((data) => {
        emitProgress(onProgress, {
          type: 'source_complete',
          source,
          timing: Date.now() - startTime,
          preview: preview(data),
        })
        return data
      })
      .catch((err) => {
        console.error(`[Research] ${source} fetch failed for "${normalizedWord}":`, safeError(err))
        emitProgress(onProgress, {
          type: 'source_failed',
          source,
          error: safeError(err),
        })
        return null
      })
  }

  const runRequiredSource = <T>(
    source: string,
    startTime: number,
    fetcher: () => Promise<T | null>,
    preview: (data: T | null) => string | undefined,
    options?: { failHard?: boolean }
  ): Promise<T | null> => {
    const failHard = options?.failHard ?? true
    return fetcher()
      .then((data) => {
        emitProgress(onProgress, {
          type: 'source_complete',
          source,
          timing: Date.now() - startTime,
          preview: preview(data),
        })
        return data
      })
      .catch((err) => {
        if (!failHard) {
          console.error(
            `[Research] ${source} fetch failed for "${normalizedWord}":`,
            safeError(err)
          )
        }
        emitProgress(onProgress, {
          type: 'source_failed',
          source,
          error: safeError(err),
        })
        if (failHard) throw err
        return null
      })
  }

  // Phase 1: Initial fetch for main word
  console.log(
    `[Research] Phase 1: Fetching main word "${normalizedWord}"${skipOptional ? ' (skip optional sources)' : ''}`
  )

  // Emit source_started events
  emitProgress(onProgress, { type: 'source_started', source: 'etymonline' })
  emitProgress(onProgress, { type: 'source_started', source: 'wiktionary' })
  emitProgress(onProgress, { type: 'source_started', source: 'freeDictionary' })
  if (!skipOptional) {
    emitProgress(onProgress, { type: 'source_started', source: 'urbanDictionary' })
    emitProgress(onProgress, { type: 'source_started', source: 'wikipedia' })
    emitProgress(onProgress, { type: 'source_started', source: 'incelsWiki' })
  }

  const startTime = Date.now()
  const [
    etymonlineData,
    wiktionaryData,
    freeDictionaryData,
    urbanDictionaryData,
    wikipediaData,
    incelsWikiData,
  ] = await Promise.all([
    runRequiredSource(
      'etymonline',
      startTime,
      () => fetchEtymonline(normalizedWord),
      (data) => data?.text.slice(0, 100)
    ),
    runRequiredSource(
      'wiktionary',
      startTime,
      () => fetchWiktionary(normalizedWord),
      (data) => data?.text.slice(0, 100)
    ),
    runRequiredSource(
      'freeDictionary',
      startTime,
      () => fetchFreeDictionary(normalizedWord),
      (data) => data?.origin?.slice(0, 100),
      { failHard: false }
    ),
    skipOptional
      ? Promise.resolve(null)
      : runOptionalSource(
          'urbanDictionary',
          startTime,
          () => fetchUrbanDictionary(normalizedWord),
          (data) => data?.text.slice(0, 100)
        ),
    skipOptional
      ? Promise.resolve(null)
      : runOptionalSource(
          'wikipedia',
          startTime,
          () => fetchWikipedia(normalizedWord),
          (data) => data?.text.slice(0, 100)
        ),
    skipOptional
      ? Promise.resolve(null)
      : runOptionalSource(
          'incelsWiki',
          startTime,
          () => fetchIncelsWiki(normalizedWord),
          (data) => data?.text.slice(0, 100)
        ),
  ])
  totalFetches += 3 + (skipOptional ? 0 : 3)

  const context: ResearchContext = {
    mainWord: {
      word: normalizedWord,
      etymonline: etymonlineData,
      wiktionary: wiktionaryData,
      freeDictionary: freeDictionaryData,
      urbanDictionary: urbanDictionaryData,
      wikipedia: wikipediaData,
      incelsWiki: incelsWikiData,
    },
    identifiedRoots: [],
    rootResearch: [],
    relatedResearch: [],
    totalSourcesFetched: totalFetches,
    rawSources: {
      wikipedia: wikipediaData?.text,
    },
  }

  // Phase 1.5: Pre-parse etymology chains from source text (CPU-only, no API calls)
  console.log('[Research] Phase 1.5: Pre-parsing etymology chains')
  const parsedChains = parseSourceTexts(
    normalizedWord,
    etymonlineData?.text ?? null,
    wiktionaryData?.text ?? null
  )
  context.parsedChains = parsedChains
  const dateAttested = parsedChains.find((c) => c.dateAttested)?.dateAttested
  if (dateAttested && context.rawSources) {
    context.rawSources.dateAttested = dateAttested
  }
  console.log(
    `[Research] Parsed ${parsedChains.length} chain(s) with ${parsedChains.reduce((sum, c) => sum + c.links.length, 0)} total links`
  )
  emitProgress(onProgress, {
    type: 'parsing_complete',
    chainCount: parsedChains.length,
  })

  // If no data found at all, return early
  if (!etymonlineData && !wiktionaryData) {
    console.log('[Research] No source data found for main word')
    return context
  }

  // Phase 2: Extract roots from initial data
  console.log('[Research] Phase 2: Extracting roots')
  const identifiedRoots = await extractRootsQuick(
    normalizedWord,
    etymonlineData?.text ?? null,
    wiktionaryData?.text ?? null
  )
  context.identifiedRoots = identifiedRoots
  console.log(`[Research] Identified roots: ${identifiedRoots.join(', ') || 'none'}`)
  emitProgress(onProgress, {
    type: 'roots_identified',
    roots: identifiedRoots,
  })

  // Phase 3: Fetch data for each root (if different from main word)
  console.log('[Research] Phase 3: Researching roots')
  const rootsToResearch = identifiedRoots.filter(
    (root) => root !== normalizedWord && root.length > 1
  )

  const remainingBudget = CONFIG.maxTotalFetches - totalFetches
  const maxRootsByBudget = Math.floor(remainingBudget / 2)
  const rootsToFetch = rootsToResearch.slice(
    0,
    Math.min(maxRootsByBudget, CONFIG.maxRootsToExplore)
  )

  if (rootsToFetch.length > 0) {
    console.log(
      `[Research] Fetching ${rootsToFetch.length} roots in parallel: ${rootsToFetch.join(', ')}`
    )

    const rootResults = await Promise.allSettled(
      rootsToFetch.map((root) => fetchRootResearch(root))
    )

    for (const result of rootResults) {
      if (result.status === 'fulfilled') {
        const rootData = result.value
        context.rootResearch.push(rootData)
        totalFetches += 2

        emitProgress(onProgress, {
          type: 'root_research',
          root: rootData.root,
          source: 'etymonline+wiktionary',
          status: 'complete',
        })
      } else {
        console.error('[Research] Root fetch failed:', safeError(result.reason))
        emitProgress(onProgress, {
          type: 'root_research',
          root: rootsToFetch[rootResults.indexOf(result)],
          source: 'unknown',
          status: 'failed',
        })
      }
    }
  } else {
    console.log('[Research] Skipping roots (budget or no roots found)')
  }

  // Phase 4: Expand breadth with a few related etymology entries
  console.log('[Research] Phase 4: Researching related terms')
  const mainCombinedText = [etymonlineData?.text, wiktionaryData?.text].filter(Boolean).join(' ')
  const mainRelatedTerms = extractRelatedTerms(
    mainCombinedText,
    [normalizedWord, ...identifiedRoots],
    etymonlineData?.relatedEntries ?? []
  )
  const relatedCandidates = Array.from(
    new Set(
      [
        ...mainRelatedTerms,
        ...context.rootResearch.flatMap((rootData) => rootData.relatedTerms),
      ].filter((term) => !identifiedRoots.includes(term))
    )
  )
  const remainingRelatedBudget = CONFIG.maxTotalFetches - totalFetches
  const maxRelatedByBudget = Math.floor(remainingRelatedBudget / 2)
  const relatedTermsToFetch = relatedCandidates.slice(
    0,
    Math.min(maxRelatedByBudget, CONFIG.maxRelatedWordsPerRoot)
  )

  if (relatedTermsToFetch.length > 0) {
    console.log(
      `[Research] Fetching ${relatedTermsToFetch.length} related terms in parallel: ${relatedTermsToFetch.join(', ')}`
    )

    const relatedResults = await Promise.allSettled(
      relatedTermsToFetch.map((term) => fetchRelatedTermResearch(term))
    )

    for (const [index, result] of relatedResults.entries()) {
      if (result.status === 'fulfilled') {
        context.relatedResearch.push(result.value)
        totalFetches += 2
        continue
      }

      console.error('[Research] Related-term fetch failed:', safeError(result.reason))
      console.warn(
        `[Research] Related-term fetch skipped: ${relatedTermsToFetch[index] ?? 'unknown'}`
      )
    }
  } else {
    console.log('[Research] Skipping related terms (budget or no candidates found)')
  }

  context.totalSourcesFetched = totalFetches
  console.log(`[Research] Complete. Total fetches: ${totalFetches}`)

  return context
}

/**
 * Sanitize source text for safe embedding inside <source_data> XML tags.
 * Strips XML tags, control characters, and Unicode directional overrides
 * to prevent prompt injection via source data.
 */
function sanitizeSourceText(text: string, maxChars: number): string {
  let sanitized = text
  // Strip ALL XML-like tags
  sanitized = sanitized.replace(/<\/?[a-zA-Z][^>]*>/g, '')
  // Neutralize control characters (U+0000–U+001F except \n \t)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  // Neutralize Unicode directional overrides
  sanitized = sanitized.replace(/[\u200E\u200F\u202A-\u202E]/g, '')
  return sanitized.slice(0, maxChars)
}

/**
 * Build a rich prompt from research context for final synthesis.
 * Source data is wrapped in <source_data> XML tags for prompt injection defense
 * and truncated to CONFIG.maxSourceTextChars.
 */
export function buildResearchPrompt(context: ResearchContext): string {
  const sections: string[] = []
  const maxChars = CONFIG.maxSourceTextChars

  // Main word section
  sections.push(`=== Main Word: "${context.mainWord.word}" ===`)
  if (context.mainWord.etymonline) {
    sections.push(
      `\n<source_data name="etymonline">\n${sanitizeSourceText(context.mainWord.etymonline.text, maxChars)}\n</source_data>`
    )
    if (context.mainWord.etymonline.relatedEntries?.length) {
      sections.push(
        `Etymonline linked entries: ${context.mainWord.etymonline.relatedEntries.join(', ')}`
      )
    }
  }
  if (context.mainWord.wiktionary) {
    sections.push(
      `\n<source_data name="wiktionary">\n${sanitizeSourceText(context.mainWord.wiktionary.text, maxChars)}\n</source_data>`
    )
  }
  if (context.mainWord.wikipedia) {
    sections.push(
      `\n<source_data name="wikipedia">\n${sanitizeSourceText(context.mainWord.wikipedia.text, maxChars)}\n</source_data>`
    )
  }
  if (context.mainWord.freeDictionary) {
    sections.push(
      `\n<source_data name="free_dictionary">\n${sanitizeSourceText(JSON.stringify(context.mainWord.freeDictionary), maxChars)}\n</source_data>`
    )
  }
  if (context.mainWord.urbanDictionary) {
    sections.push(
      `\n<source_data name="urban_dictionary">\n${sanitizeSourceText(context.mainWord.urbanDictionary.text, maxChars)}\n</source_data>`
    )
  }
  if (context.mainWord.incelsWiki) {
    sections.push(
      `\n<source_data name="incels_wiki">\n${sanitizeSourceText(context.mainWord.incelsWiki.text, maxChars)}\n</source_data>`
    )
  }

  // Identified roots
  if (context.identifiedRoots.length > 0) {
    sections.push(`\n=== Identified Root Components ===\n${context.identifiedRoots.join(', ')}`)
  }

  // Root research sections
  for (const rootData of context.rootResearch) {
    sections.push(`\n=== Root: "${rootData.root}" ===`)
    if (rootData.etymonlineData) {
      sections.push(
        `<source_data name="etymonline">\n${sanitizeSourceText(rootData.etymonlineData.text, maxChars)}\n</source_data>`
      )
      if (rootData.etymonlineData.relatedEntries?.length) {
        sections.push(
          `Etymonline linked entries: ${rootData.etymonlineData.relatedEntries.join(', ')}`
        )
      }
    }
    if (rootData.wiktionaryData) {
      sections.push(
        `<source_data name="wiktionary">\n${sanitizeSourceText(rootData.wiktionaryData.text, maxChars)}\n</source_data>`
      )
    }
    if (rootData.relatedTerms.length > 0) {
      sections.push(`Related terms found: ${rootData.relatedTerms.join(', ')}`)
    }
  }

  for (const relatedData of context.relatedResearch) {
    sections.push(`\n=== Related Term: "${relatedData.term}" ===`)
    if (relatedData.etymonlineData) {
      sections.push(
        `<source_data name="etymonline">\n${sanitizeSourceText(relatedData.etymonlineData.text, maxChars)}\n</source_data>`
      )
    }
    if (relatedData.wiktionaryData) {
      sections.push(
        `<source_data name="wiktionary">\n${sanitizeSourceText(relatedData.wiktionaryData.text, maxChars)}\n</source_data>`
      )
    }
  }

  // Append pre-parsed etymology chains if available
  if (context.parsedChains && context.parsedChains.length > 0) {
    const chainsText = formatParsedChainsForPrompt(context.parsedChains)
    if (chainsText) {
      sections.push('\n' + chainsText)
    }
  }

  return sections.join('\n')
}
