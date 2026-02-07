import Anthropic from '@anthropic-ai/sdk'
import { EtymologyResult, SourceReference, ResearchContext } from './types'
import { SYSTEM_PROMPT, buildRichUserPrompt } from './prompts'
import { buildResearchPrompt } from './research'
import { enrichAncestryGraph } from './etymologyEnricher'
import { ETYMOLOGY_SCHEMA } from '@/lib/schemas/llm-schema'
import { CONFIG } from './config'

/**
 * Call Anthropic API with structured output using server-side key
 */
async function callAnthropic(userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set')
  }

  const client = new Anthropic({ apiKey })

  const response = await client.beta.messages.create({
    model: CONFIG.model,
    max_tokens: CONFIG.synthesisMaxTokens,
    betas: ['structured-outputs-2025-11-13'],
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    output_format: {
      type: 'json_schema',
      schema: ETYMOLOGY_SCHEMA,
    },
  })

  const textContent = response.content.find((block) => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude')
  }
  return textContent.text
}

/**
 * Sanitize a suggestion word: strip parenthetical annotations, descriptions,
 * em-dashes, and other noise the LLM may include despite instructions.
 * Returns just the word itself.
 */
function sanitizeSuggestionWord(raw: string): string {
  let text = raw.trim()

  // Strip parenthetical annotations: "affect (verb: to influence)" → "affect"
  text = text.replace(/\s*\([^)]*\).*$/, '')

  // Strip em-dash/en-dash trailing descriptions: "ensure—to make certain" → "ensure"
  text = text.replace(/\s*[—–].*$/, '')
  text = text.replace(/\s+-\s+.*$/, '')

  // Strip colon descriptions: "effect: noun meaning result" → "effect"
  text = text.replace(/:\s*.{5,}$/, '')

  // Strip trailing punctuation
  text = text.replace(/[.,;:!?]+$/, '').trim()

  // If still unreasonably long, take first word-like chunk
  if (text.length > 40) {
    const match = text.match(/^[\w\u00C0-\u024F]+(?:[\s-][\w\u00C0-\u024F]+)?/)
    if (match) text = match[0]
  }

  return text || raw.trim()
}

/**
 * Sanitize all suggestion arrays in an EtymologyResult.
 */
function sanitizeSuggestions(result: EtymologyResult): void {
  if (!result.suggestions) return

  const fields = ['synonyms', 'antonyms', 'homophones', 'easilyConfusedWith', 'seeAlso'] as const

  for (const field of fields) {
    const arr = result.suggestions[field]
    if (arr) {
      result.suggestions[field] = arr.map(sanitizeSuggestionWord).filter((w) => w.length > 0)
    }
  }
}

/**
 * Generate etymology response via Anthropic structured output
 */
async function generateEtymologyResponse(userPrompt: string): Promise<EtymologyResult> {
  const responseText = await callAnthropic(userPrompt)

  try {
    const result = JSON.parse(responseText) as EtymologyResult
    sanitizeSuggestions(result)
    return result
  } catch (e) {
    const preview = responseText.slice(0, 200)
    throw new Error(`Failed to parse LLM response as JSON: ${e}. Response preview: ${preview}`)
  }
}

/**
 * Synthesize etymology from rich research context (agentic mode)
 * Uses aggregated data from multiple sources and root exploration
 */
export async function synthesizeFromResearch(
  researchContext: ResearchContext
): Promise<EtymologyResult> {
  const researchData = buildResearchPrompt(researchContext)
  const userPrompt = buildRichUserPrompt(researchContext.mainWord.word, researchData)

  const result = await generateEtymologyResponse(userPrompt)

  // Enrich ancestry graph with source evidence and confidence levels
  if (researchContext.parsedChains && researchContext.parsedChains.length > 0) {
    enrichAncestryGraph(result.ancestryGraph, researchContext.parsedChains)
  }

  // Build sources array with URLs and word info from research context
  const sources: SourceReference[] = []
  const mainWord = researchContext.mainWord.word
  if (researchContext.mainWord.etymonline) {
    sources.push({
      name: 'etymonline',
      url: researchContext.mainWord.etymonline.url,
      word: mainWord,
    })
  }
  if (researchContext.mainWord.wiktionary) {
    sources.push({
      name: 'wiktionary',
      url: researchContext.mainWord.wiktionary.url,
      word: mainWord,
    })
  }
  for (const rootData of researchContext.rootResearch) {
    if (rootData.etymonlineData && !sources.some((s) => s.url === rootData.etymonlineData?.url)) {
      sources.push({ name: 'etymonline', url: rootData.etymonlineData.url, word: rootData.root })
    }
    if (rootData.wiktionaryData && !sources.some((s) => s.url === rootData.wiktionaryData?.url)) {
      sources.push({ name: 'wiktionary', url: rootData.wiktionaryData.url, word: rootData.root })
    }
  }
  if (sources.length === 0) {
    sources.push({ name: 'synthesized' })
  }
  result.sources = sources

  return result
}
