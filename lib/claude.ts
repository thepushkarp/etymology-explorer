import Anthropic from '@anthropic-ai/sdk'
import {
  EtymologyResult,
  RawSourceData,
  SourceReference,
  LLMConfig,
  ResearchContext,
} from './types'
import { SYSTEM_PROMPT, buildUserPrompt, buildRichUserPrompt } from './prompts'
import { buildResearchPrompt } from './research'
import { enrichAncestryGraph } from './etymologyEnricher'
import { ETYMOLOGY_SCHEMA } from '@/lib/schemas/llm-schema'

/**
 * Call OpenRouter API with structured output
 */
async function callOpenRouter(userPrompt: string, config: LLMConfig): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openrouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://etymology-explorer.vercel.app',
      'X-Title': 'Etymology Explorer',
    },
    body: JSON.stringify({
      model: config.openrouterModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2048,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'etymology_result',
          strict: true,
          schema: ETYMOLOGY_SCHEMA,
        },
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    if (response.status === 401) {
      throw new Error('401: Invalid OpenRouter API key')
    }
    if (response.status === 429) {
      throw new Error('429: Rate limit exceeded')
    }
    throw new Error(`OpenRouter API error: ${error}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenRouter')
  }
  return content
}

/**
 * Call Anthropic API with structured output
 */
async function callAnthropic(userPrompt: string, config: LLMConfig): Promise<string> {
  const client = new Anthropic({
    apiKey: config.anthropicApiKey,
  })

  // Use the beta API for structured outputs
  const response = await client.beta.messages.create({
    model: config.anthropicModel,
    max_tokens: 2048,
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
 * Helper to generate etymology response using configured provider
 */
async function generateEtymologyResponse(
  userPrompt: string,
  config: LLMConfig
): Promise<EtymologyResult> {
  let responseText: string
  if (config.provider === 'openrouter') {
    responseText = await callOpenRouter(userPrompt, config)
  } else {
    responseText = await callAnthropic(userPrompt, config)
  }

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
 * Synthesize etymology from source data using configured LLM provider
 */
export async function synthesizeEtymology(
  word: string,
  sourceData: RawSourceData,
  llmConfig: LLMConfig
): Promise<EtymologyResult> {
  // Extract text for the prompt
  const etymonlineText = sourceData.etymonline?.text ?? null
  const wiktionaryText = sourceData.wiktionary?.text ?? null
  const userPrompt = buildUserPrompt(word, etymonlineText, wiktionaryText)

  // Call provider
  const result = await generateEtymologyResponse(userPrompt, llmConfig)

  // Build sources array with URLs and word info
  const sources: SourceReference[] = []
  if (sourceData.etymonline) {
    sources.push({ name: 'etymonline', url: sourceData.etymonline.url, word })
  }
  if (sourceData.wiktionary) {
    sources.push({ name: 'wiktionary', url: sourceData.wiktionary.url, word })
  }
  if (sources.length === 0) {
    sources.push({ name: 'synthesized' })
  }
  result.sources = sources

  return result
}

/**
 * Synthesize etymology from rich research context (agentic mode)
 * Uses aggregated data from multiple sources and root exploration
 */
export async function synthesizeFromResearch(
  researchContext: ResearchContext,
  llmConfig: LLMConfig
): Promise<EtymologyResult> {
  // Build rich prompt from research context
  const researchData = buildResearchPrompt(researchContext)
  const userPrompt = buildRichUserPrompt(researchContext.mainWord.word, researchData)

  // Call provider
  const result = await generateEtymologyResponse(userPrompt, llmConfig)

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
  // Add sources from root research (each with its specific root word)
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
