/**
 * Agentic research module for deep etymology exploration.
 * Conducts multi-source lookups to gather rich context about word origins,
 * roots, and related terms.
 */

import { fetchEtymonline } from './etymonline'
import { fetchWiktionary } from './wiktionary'
import { fetchWikipedia } from './wikipedia'
import { fetchUrbanDictionary } from './urbanDictionary'
import { ResearchContext, RootResearchData, LLMConfig } from './types'
import Anthropic from '@anthropic-ai/sdk'

// Limits to control API costs
const MAX_ROOTS_TO_EXPLORE = 3
const MAX_RELATED_WORDS_PER_ROOT = 2
const MAX_TOTAL_FETCHES = 10

/**
 * Extract probable roots from initial source data using a quick LLM call.
 * Uses a small, fast model to minimize cost.
 */
export async function extractRootsQuick(
  word: string,
  etymonlineText: string | null,
  wiktionaryText: string | null,
  llmConfig: LLMConfig
): Promise<string[]> {
  const sourceText = [etymonlineText, wiktionaryText].filter(Boolean).join('\n\n')

  if (!sourceText) {
    // No source data - return empty, we'll let the main synthesis handle it
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
    if (llmConfig.provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${llmConfig.openrouterApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: llmConfig.openrouterModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 100,
        }),
      })

      if (!response.ok) {
        console.error('Root extraction failed:', await response.text())
        return []
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || '[]'
      return parseRootsArray(content)
    } else {
      const client = new Anthropic({ apiKey: llmConfig.anthropicApiKey })
      const response = await client.messages.create({
        model: llmConfig.anthropicModel,
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      })

      const textContent = response.content.find((block) => block.type === 'text')
      if (!textContent || textContent.type !== 'text') return []
      return parseRootsArray(textContent.text)
    }
  } catch (error) {
    console.error('Root extraction error:', error)
    return []
  }
}

/**
 * Parse a JSON array of roots from LLM response
 */
function parseRootsArray(text: string): string[] {
  try {
    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*?\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((s) => s.toLowerCase().trim())
      .slice(0, MAX_ROOTS_TO_EXPLORE)
  } catch {
    return []
  }
}

/**
 * Extract related terms mentioned in source text
 */
function extractRelatedTerms(text: string, excludeWord: string): string[] {
  // Look for patterns like "related to X", "from X", "see also X", "cognate with X"
  const patterns = [
    /related to (\w+)/gi,
    /cognate with (\w+)/gi,
    /see also (\w+)/gi,
    /compare (\w+)/gi,
    /akin to (\w+)/gi,
    /from (\w+) ["'](\w+)["']/gi, // "from Latin 'word'"
  ]

  const terms = new Set<string>()
  const excludeLower = excludeWord.toLowerCase()

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const term = (match[2] || match[1]).toLowerCase().trim()
      // Filter out common non-word matches and the original word
      if (term.length > 2 && term !== excludeLower && !/^(the|and|for|from|with)$/.test(term)) {
        terms.add(term)
      }
    }
  }

  return Array.from(terms).slice(0, MAX_RELATED_WORDS_PER_ROOT)
}

/**
 * Fetch research data for a single root
 */
async function fetchRootResearch(root: string): Promise<RootResearchData> {
  const [etymonlineData, wiktionaryData] = await Promise.all([
    fetchEtymonline(root),
    fetchWiktionary(root),
  ])

  // Extract related terms from whatever data we got
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
 * Conduct agentic research to gather rich etymology context.
 * This is the main orchestrator that:
 * 1. Fetches initial word data
 * 2. Extracts roots using quick LLM call
 * 3. Fetches context for each root
 * 4. Fetches related words (depth-limited)
 */
export async function conductAgenticResearch(
  word: string,
  llmConfig: LLMConfig
): Promise<ResearchContext> {
  let totalFetches = 0
  const normalizedWord = word.toLowerCase().trim()

  // Phase 1: Initial fetch for main word (4 sources in parallel)
  console.log(`[Research] Phase 1: Fetching main word "${normalizedWord}"`)
  const [etymonlineData, wiktionaryData, wikipediaData, urbanDictData] = await Promise.all([
    fetchEtymonline(normalizedWord),
    fetchWiktionary(normalizedWord),
    fetchWikipedia(normalizedWord).catch((err) => {
      console.error(`[Research] Wikipedia fetch failed for "${normalizedWord}":`, err)
      return null
    }),
    fetchUrbanDictionary(normalizedWord).catch((err) => {
      console.error(`[Research] Urban Dictionary fetch failed for "${normalizedWord}":`, err)
      return null
    }),
  ])
  totalFetches += 4

  const context: ResearchContext = {
    mainWord: {
      word: normalizedWord,
      etymonline: etymonlineData,
      wiktionary: wiktionaryData,
      wikipedia: wikipediaData,
      urbanDictionary: urbanDictData,
    },
    identifiedRoots: [],
    rootResearch: [],
    relatedWordsData: {},
    totalSourcesFetched: totalFetches,
  }

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
    wiktionaryData?.text ?? null,
    llmConfig
  )
  context.identifiedRoots = identifiedRoots
  console.log(`[Research] Identified roots: ${identifiedRoots.join(', ') || 'none'}`)

  // Phase 3: Fetch data for each root (if different from main word)
  console.log('[Research] Phase 3: Researching roots')
  const rootsToResearch = identifiedRoots.filter(
    (root) => root !== normalizedWord && root.length > 1
  )

  // Calculate budget for roots
  // Each root fetch costs 2 calls
  const remainingBudget = MAX_TOTAL_FETCHES - totalFetches
  const maxRootsByBudget = Math.floor(remainingBudget / 2)

  // Take only as many roots as we can afford, or the max limit
  const rootsToFetch = rootsToResearch.slice(0, Math.min(maxRootsByBudget, MAX_ROOTS_TO_EXPLORE))

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

        // Phase 4: Fetch a couple of related terms for depth
        // We do this sequentially to strictly respect the limit
        for (const relatedTerm of rootData.relatedTerms.slice(0, MAX_RELATED_WORDS_PER_ROOT)) {
          if (totalFetches >= MAX_TOTAL_FETCHES) break
          if (context.relatedWordsData[relatedTerm]) continue // Already fetched

          console.log(`[Research] Fetching related term: "${relatedTerm}"`)
          const relatedData = await fetchEtymonline(relatedTerm)
          if (relatedData) {
            context.relatedWordsData[relatedTerm] = relatedData
          }
          totalFetches += 1
        }
      } else {
        console.error('[Research] Root fetch failed:', result.reason)
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
 * Build a rich prompt from research context for final synthesis
 */
export function buildResearchPrompt(context: ResearchContext): string {
  const sections: string[] = []

  // Main word section
  sections.push(`=== Main Word: "${context.mainWord.word}" ===`)
  if (context.mainWord.etymonline) {
    sections.push(`\n--- Etymonline ---\n${context.mainWord.etymonline.text}`)
  }
  if (context.mainWord.wiktionary) {
    sections.push(`\n--- Wiktionary ---\n${context.mainWord.wiktionary.text}`)
  }
  if (context.mainWord.wikipedia) {
    sections.push(`\n--- Wikipedia ---\n${context.mainWord.wikipedia.text}`)
  }
  if (context.mainWord.urbanDictionary) {
    sections.push(
      `\n--- Urban Dictionary (Modern Usage) ---\n${context.mainWord.urbanDictionary.text}`
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
      sections.push(`--- Etymonline ---\n${rootData.etymonlineData.text}`)
    }
    if (rootData.wiktionaryData) {
      sections.push(`--- Wiktionary ---\n${rootData.wiktionaryData.text}`)
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
      sections.push(`\n--- ${term} ---\n${data.text}`)
    }
  }

  return sections.join('\n')
}
