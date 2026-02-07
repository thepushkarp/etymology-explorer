/**
 * Agentic research module for deep etymology exploration.
 * Conducts multi-source lookups to gather rich context about word origins,
 * roots, and related terms.
 */

import Anthropic from '@anthropic-ai/sdk'

import { LLM_POLICY, RESEARCH_POLICY, TIMEOUT_POLICY } from '@/lib/config/guardrails'
import { ensureAnthropicConfigured } from '@/lib/server/env'
import { wrapUntrustedSource } from '@/lib/security/prompt-defense'
import { fetchEtymonline, fetchEtymonlineWithStatus } from './etymonline'
import { fetchWiktionary, fetchWiktionaryWithStatus } from './wiktionary'
import { fetchWikipedia } from './wikipedia'
import { fetchUrbanDictionary } from './urbanDictionary'
import { parseSourceTexts, formatParsedChainsForPrompt } from './etymologyParser'
import { ResearchContext, RootResearchData, SourceData } from './types'

interface ResearchOptions {
  includeWikipedia?: boolean
  includeUrbanDictionary?: boolean
  extractRoots?: boolean
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

/**
 * Extract probable roots from initial source data using a quick LLM call.
 * Uses the same pinned model with a very small token budget.
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

  const prompt = [
    `Analyze this etymology data and extract root morphemes/components for "${word}".`,
    '',
    wrapUntrustedSource('ROOT_EXTRACTION_CONTEXT', sourceText),
    '',
    'Return ONLY a JSON array of roots.',
    'Examples:',
    '- "telephone" => ["tele", "phone"]',
    '- "autobiography" => ["auto", "bio", "graph"]',
    '- "cat" => ["cat"]',
    '- "incredible" => ["in", "cred"]',
  ].join('\n')

  try {
    const env = ensureAnthropicConfigured()
    const client = new Anthropic({ apiKey: env.anthropicApiKey })

    const response = await withTimeout(
      client.messages.create({
        model: env.anthropicModel,
        max_tokens: LLM_POLICY.rootExtractionMaxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      TIMEOUT_POLICY.llmMs,
      'Root extraction timed out'
    )

    const textContent = response.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') return []
    return parseRootsArray(textContent.text)
  } catch {
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
      .slice(0, RESEARCH_POLICY.maxRootsToExplore)
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

  return Array.from(terms).slice(0, RESEARCH_POLICY.maxRelatedWordsPerRoot)
}

/**
 * Fetch research data for a single root
 */
async function fetchRootResearch(root: string): Promise<RootResearchData> {
  const [etymonlineData, wiktionaryData] = await Promise.all([fetchEtymonline(root), fetchWiktionary(root)])

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
 */
export async function conductAgenticResearch(
  word: string,
  options: ResearchOptions = {}
): Promise<ResearchContext> {
  const {
    includeWikipedia = true,
    includeUrbanDictionary = true,
    extractRoots = true,
  } = options

  let totalFetches = 0
  const normalizedWord = word.toLowerCase().trim()

  const [etymonlineResult, wiktionaryResult, wikipediaData, urbanDictData] =
    await Promise.all([
      fetchEtymonlineWithStatus(normalizedWord),
      fetchWiktionaryWithStatus(normalizedWord),
      includeWikipedia ? fetchWikipedia(normalizedWord) : Promise.resolve<SourceData | null>(null),
      includeUrbanDictionary
        ? fetchUrbanDictionary(normalizedWord)
        : Promise.resolve<SourceData | null>(null),
    ])
  const etymonlineData = etymonlineResult.data
  const wiktionaryData = wiktionaryResult.data
  totalFetches += 4

  const context: ResearchContext = {
    mainWord: {
      word: normalizedWord,
      etymonline: etymonlineData,
      wiktionary: wiktionaryData,
      etymonlineStatus: etymonlineResult.status,
      wiktionaryStatus: wiktionaryResult.status,
      wikipedia: wikipediaData,
      urbanDictionary: urbanDictData,
    },
    identifiedRoots: [],
    rootResearch: [],
    relatedWordsData: {},
    totalSourcesFetched: totalFetches,
  }

  context.parsedChains = parseSourceTexts(
    normalizedWord,
    etymonlineData?.text ?? null,
    wiktionaryData?.text ?? null
  )

  if (!etymonlineData && !wiktionaryData) {
    return context
  }

  const identifiedRoots = extractRoots
    ? await extractRootsQuick(normalizedWord, etymonlineData?.text ?? null, wiktionaryData?.text ?? null)
    : []

  context.identifiedRoots = identifiedRoots

  const rootsToResearch = identifiedRoots.filter((root) => root !== normalizedWord && root.length > 1)
  const remainingBudget = RESEARCH_POLICY.maxTotalFetches - totalFetches
  const maxRootsByBudget = Math.floor(remainingBudget / 2)
  const rootsToFetch = rootsToResearch.slice(
    0,
    Math.min(maxRootsByBudget, RESEARCH_POLICY.maxRootsToExplore)
  )

  if (rootsToFetch.length > 0) {
    const rootResults = await Promise.allSettled(rootsToFetch.map((root) => fetchRootResearch(root)))

    for (const result of rootResults) {
      if (result.status !== 'fulfilled') continue

      const rootData = result.value
      context.rootResearch.push(rootData)
      totalFetches += 2

      for (const relatedTerm of rootData.relatedTerms.slice(0, RESEARCH_POLICY.maxRelatedWordsPerRoot)) {
        if (totalFetches >= RESEARCH_POLICY.maxTotalFetches) break
        if (context.relatedWordsData[relatedTerm]) continue

        const relatedData = await fetchEtymonline(relatedTerm)
        if (relatedData) {
          context.relatedWordsData[relatedTerm] = relatedData
        }
        totalFetches += 1
      }
    }
  }

  context.totalSourcesFetched = totalFetches
  return context
}

/**
 * Build a rich prompt from research context for final synthesis
 */
export function buildResearchPrompt(context: ResearchContext): string {
  const sections: string[] = []

  sections.push(`=== Main Word: "${context.mainWord.word}" ===`)
  if (context.mainWord.etymonline) {
    sections.push(wrapUntrustedSource('Etymonline', context.mainWord.etymonline.text))
  }
  if (context.mainWord.wiktionary) {
    sections.push(wrapUntrustedSource('Wiktionary', context.mainWord.wiktionary.text))
  }
  if (context.mainWord.wikipedia) {
    sections.push(wrapUntrustedSource('Wikipedia', context.mainWord.wikipedia.text))
  }
  if (context.mainWord.urbanDictionary) {
    sections.push(wrapUntrustedSource('Urban Dictionary', context.mainWord.urbanDictionary.text))
  }

  if (context.identifiedRoots.length > 0) {
    sections.push(`=== Identified Root Components ===\n${context.identifiedRoots.join(', ')}`)
  }

  for (const rootData of context.rootResearch) {
    sections.push(`=== Root: "${rootData.root}" ===`)
    if (rootData.etymonlineData) {
      sections.push(wrapUntrustedSource('Etymonline', rootData.etymonlineData.text))
    }
    if (rootData.wiktionaryData) {
      sections.push(wrapUntrustedSource('Wiktionary', rootData.wiktionaryData.text))
    }
    if (rootData.relatedTerms.length > 0) {
      sections.push(`Related terms found: ${rootData.relatedTerms.join(', ')}`)
    }
  }

  const relatedEntries = Object.entries(context.relatedWordsData)
  if (relatedEntries.length > 0) {
    sections.push('=== Related Words Research ===')
    for (const [term, data] of relatedEntries) {
      sections.push(`--- ${term} ---`)
      sections.push(wrapUntrustedSource(`Etymonline:${term}`, data.text))
    }
  }

  if (context.parsedChains && context.parsedChains.length > 0) {
    const chainsText = formatParsedChainsForPrompt(context.parsedChains)
    if (chainsText) {
      sections.push(chainsText)
    }
  }

  return sections.join('\n\n')
}
