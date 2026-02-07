import Anthropic from '@anthropic-ai/sdk'

import { LLM_POLICY, TIMEOUT_POLICY } from '@/lib/config/guardrails'
import { ETYMOLOGY_SCHEMA } from '@/lib/schemas/llm-schema'
import { EtymologyResultSchema } from '@/lib/schemas/etymology'
import { ensureAnthropicConfigured } from '@/lib/server/env'
import { safeErrorMessage } from '@/lib/security/redact'
import { buildResearchPrompt } from './research'
import { enrichAncestryGraph } from './etymologyEnricher'
import { SYSTEM_PROMPT, buildRichUserPrompt, buildUserPrompt } from './prompts'
import { EtymologyResult, RawSourceData, ResearchContext, SourceReference } from './types'

export interface LLMUsage {
  inputTokens: number
  outputTokens: number
}

export interface SynthesisResponse {
  result: EtymologyResult
  usage: LLMUsage
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
 * Call Anthropic API with structured output.
 */
async function callAnthropic(userPrompt: string): Promise<{ text: string; usage: LLMUsage }> {
  const env = ensureAnthropicConfigured()
  const client = new Anthropic({ apiKey: env.anthropicApiKey })

  const response = await withTimeout(
    client.beta.messages.create({
      model: env.anthropicModel,
      max_tokens: LLM_POLICY.maxTokens,
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
    }),
    TIMEOUT_POLICY.llmMs,
    'Claude request timed out'
  )

  const textContent = response.content.find((block) => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  const inputTokens = Number(response.usage?.input_tokens || 0)
  const outputTokens = Number(response.usage?.output_tokens || 0)

  return {
    text: textContent.text,
    usage: {
      inputTokens,
      outputTokens,
    },
  }
}

/**
 * Sanitize a suggestion word: strip parenthetical annotations, descriptions,
 * em-dashes, and other noise the LLM may include despite instructions.
 */
function sanitizeSuggestionWord(raw: string): string {
  let text = raw.trim()

  text = text.replace(/\s*\([^)]*\).*$/, '')
  text = text.replace(/\s*[—–].*$/, '')
  text = text.replace(/\s+-\s+.*$/, '')
  text = text.replace(/:\s*.{5,}$/, '')
  text = text.replace(/[.,;:!?]+$/, '').trim()

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
 * Parse and validate an LLM response into the expected shape.
 */
function parseValidatedEtymologyResponse(responseText: string): EtymologyResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(responseText)
  } catch (error) {
    const preview = responseText.slice(0, 160)
    throw new Error(`Failed to parse LLM response as JSON. Preview: ${preview}. ${safeErrorMessage(error)}`)
  }

  const validated = EtymologyResultSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(`LLM response failed schema validation: ${validated.error.issues[0]?.message}`)
  }

  const result = validated.data as EtymologyResult
  sanitizeSuggestions(result)
  return result
}

/**
 * Synthesize etymology from source data.
 */
export async function synthesizeEtymology(
  word: string,
  sourceData: RawSourceData
): Promise<SynthesisResponse> {
  const etymonlineText = sourceData.etymonline?.text ?? null
  const wiktionaryText = sourceData.wiktionary?.text ?? null
  const userPrompt = buildUserPrompt(word, etymonlineText, wiktionaryText)

  const response = await callAnthropic(userPrompt)
  const result = parseValidatedEtymologyResponse(response.text)

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

  return {
    result,
    usage: response.usage,
  }
}

/**
 * Synthesize etymology from rich research context (agentic mode).
 */
export async function synthesizeFromResearch(
  researchContext: ResearchContext
): Promise<SynthesisResponse> {
  const researchData = buildResearchPrompt(researchContext)
  const userPrompt = buildRichUserPrompt(researchContext.mainWord.word, researchData)

  const response = await callAnthropic(userPrompt)
  const result = parseValidatedEtymologyResponse(response.text)

  if (researchContext.parsedChains && researchContext.parsedChains.length > 0) {
    enrichAncestryGraph(result.ancestryGraph, researchContext.parsedChains)
  }

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

  return {
    result,
    usage: response.usage,
  }
}
