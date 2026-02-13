/**
 * Agentic research module for deep etymology exploration.
 * Conducts multi-source lookups to gather rich context about word origins,
 * roots, and related terms.
 */

import { fetchEtymonline } from './etymonline'
import { fetchWiktionary } from './wiktionary'
import { fetchWikipedia } from './wikipedia'
import { fetchUrbanDictionary } from './urbanDictionary'
import { fetchIncelsWiki } from './incelsWiki'
import { fetchFreeDictionary } from './freeDictionary'
import { ResearchContext, RootResearchData, StreamEvent } from './types'
import { parseSourceTexts, formatParsedChainsForPrompt } from './etymologyParser'
import Anthropic from '@anthropic-ai/sdk'
import { CONFIG } from './config'
import { safeError } from './errorUtils'

/**
 * Extract probable roots from initial source data using a quick LLM call.
 * Uses the server-side API key with the configured model.
 */
export async function extractRootsQuick(
  word: string,
  etymonlineText: string | null,
  wiktionaryText: string | null
): Promise<string[]> {
  const sourceText = [etymonlineText, wiktionaryText].filter(Boolean).join('\n\n')

  if (!sourceText) {
    return []
  }

  const prompt = `Analyze this etymology data and extract the root morphemes/components of the word "${word}".

Source data:
${sourceText}

Return ONLY a JSON array of root strings (the actual morphemes, not full words).
Examples:
- For "telephone": ["tele", "phone"]
- For "autobiography": ["auto", "bio", "graph"]
- For "cat": ["cat"] (simple words have themselves as root)
- For "incredible": ["in", "cred"]

Return the JSON array only, no explanation:`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return []

    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: CONFIG.model,
      max_tokens: CONFIG.rootExtractionMaxTokens,
      messages: [{ role: 'user', content: prompt }],
    })

    const textContent = response.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') return []
    return parseRootsArray(textContent.text)
  } catch (error) {
    console.error('Root extraction error:', safeError(error))
    return []
  }
}

/**
 * Parse a JSON array of roots from LLM response
 */
function parseRootsArray(text: string): string[] {
  try {
    const jsonMatch = text.match(/\[[\s\S]*?\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((s) => s.toLowerCase().trim())
      .slice(0, CONFIG.maxRootsToExplore)
  } catch {
    return []
  }
}

/**
 * Extract related terms mentioned in source text
 */
function extractRelatedTerms(text: string, excludeWord: string): string[] {
  const patterns = [
    /related to (\w+)/gi,
    /cognate with (\w+)/gi,
    /see also (\w+)/gi,
    /compare (\w+)/gi,
    /akin to (\w+)/gi,
    /from (\w+) ["'](\w+)["']/gi,
  ]

  const terms = new Set<string>()
  const excludeLower = excludeWord.toLowerCase()

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const term = (match[2] || match[1]).toLowerCase().trim()
      if (term.length > 2 && term !== excludeLower && !/^(the|and|for|from|with)$/.test(term)) {
        terms.add(term)
      }
    }
  }

  return Array.from(terms).slice(0, CONFIG.maxRelatedWordsPerRoot)
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
  const relatedTerms = extractRelatedTerms(combinedText, root)

  return {
    root,
    etymonlineData,
    wiktionaryData,
    relatedTerms,
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
 * 4. Fetches related words (depth-limited)
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
    fetchEtymonline(normalizedWord)
      .then((data) => {
        emitProgress(onProgress, {
          type: 'source_complete',
          source: 'etymonline',
          timing: Date.now() - startTime,
          preview: data?.text.slice(0, 100),
        })
        return data
      })
      .catch((err) => {
        emitProgress(onProgress, {
          type: 'source_failed',
          source: 'etymonline',
          error: safeError(err),
        })
        throw err
      }),
    fetchWiktionary(normalizedWord)
      .then((data) => {
        emitProgress(onProgress, {
          type: 'source_complete',
          source: 'wiktionary',
          timing: Date.now() - startTime,
          preview: data?.text.slice(0, 100),
        })
        return data
      })
      .catch((err) => {
        emitProgress(onProgress, {
          type: 'source_failed',
          source: 'wiktionary',
          error: safeError(err),
        })
        throw err
      }),
    fetchFreeDictionary(normalizedWord)
      .then((data) => {
        emitProgress(onProgress, {
          type: 'source_complete',
          source: 'freeDictionary',
          timing: Date.now() - startTime,
          preview: data?.origin?.slice(0, 100),
        })
        return data
      })
      .catch((err) => {
        console.error(
          `[Research] Free Dictionary fetch failed for "${normalizedWord}":`,
          safeError(err)
        )
        emitProgress(onProgress, {
          type: 'source_failed',
          source: 'freeDictionary',
          error: safeError(err),
        })
        return null
      }),
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
    relatedWordsData: {},
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

        // Phase 4: Fetch a couple of related terms for depth
        for (const relatedTerm of rootData.relatedTerms.slice(0, CONFIG.maxRelatedWordsPerRoot)) {
          if (totalFetches >= CONFIG.maxTotalFetches) break
          if (context.relatedWordsData[relatedTerm]) continue

          console.log(`[Research] Fetching related term: "${relatedTerm}"`)
          const relatedData = await fetchEtymonline(relatedTerm)
          if (relatedData) {
            context.relatedWordsData[relatedTerm] = relatedData
            emitProgress(onProgress, {
              type: 'root_research',
              root: relatedTerm,
              source: 'etymonline',
              status: 'complete',
            })
          }
          totalFetches += 1
        }
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
 * Escape a string for safe use inside an XML attribute value.
 * Prevents attribute injection in <source_data name="..."> tags.
 */
function escapeAttr(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  )
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

  // Related words data
  const relatedEntries = Object.entries(context.relatedWordsData)
  if (relatedEntries.length > 0) {
    sections.push(`\n=== Related Words Research ===`)
    for (const [term, data] of relatedEntries) {
      sections.push(
        `\n<source_data name="${escapeAttr(term)}">\n${sanitizeSourceText(data.text, maxChars)}\n</source_data>`
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
