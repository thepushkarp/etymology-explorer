import Anthropic from '@anthropic-ai/sdk'
import { EtymologyResult, SourceReference, ResearchContext } from './types'
import { SYSTEM_PROMPT, buildRichUserPrompt } from './prompts'
import { buildResearchPrompt } from './research'
import { enrichAncestryGraph } from './etymologyEnricher'
import { ETYMOLOGY_SCHEMA } from '@/lib/schemas/llm-schema'
import { EtymologyResultSchema } from './schemas/etymology'
import { CONFIG } from './config'
import { getEnv } from './env'

export interface SynthesisResult {
  result: EtymologyResult
  usage: { inputTokens: number; outputTokens: number }
}

/**
 * Call Anthropic API with structured output using server-side key.
 * Returns the response text and token usage for cost tracking.
 */
async function callAnthropic(
  userPrompt: string
): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
  const apiKey = getEnv().ANTHROPIC_API_KEY

  const client = new Anthropic({ apiKey, timeout: CONFIG.timeouts.llm })

  const response = await client.messages.create({
    model: CONFIG.model,
    max_tokens: CONFIG.synthesisMaxTokens,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    output_config: {
      format: {
        type: 'json_schema',
        schema: ETYMOLOGY_SCHEMA,
      },
    },
  })

  const textContent = response.content.find((block) => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude')
  }
  return {
    text: textContent.text,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  }
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
 * Generate etymology response via Anthropic structured output.
 * Returns the parsed (but not yet enriched) result and token usage.
 *
 * Note: Zod validation happens later in synthesizeFromResearch(), after
 * source enrichment overwrites the LLM's string[] sources with proper
 * SourceReference[] objects.
 */
async function generateEtymologyResponse(
  userPrompt: string
): Promise<{ result: EtymologyResult; usage: { inputTokens: number; outputTokens: number } }> {
  const { text, usage } = await callAnthropic(userPrompt)

  try {
    const raw = JSON.parse(text)
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Expected JSON object, got ${typeof raw}`)
    }
    const result = raw as EtymologyResult
    sanitizeSuggestions(result)
    return { result, usage }
  } catch (e) {
    const preview = text.slice(0, 200)
    throw new Error(`Failed to parse LLM response: ${e}. Preview: ${preview}`)
  }
}

/**
 * Synthesize etymology from rich research context (agentic mode).
 * Returns both the enriched result and token usage for cost tracking.
 */
export async function synthesizeFromResearch(
  researchContext: ResearchContext
): Promise<SynthesisResult> {
  const researchData = buildResearchPrompt(researchContext)
  const userPrompt = buildRichUserPrompt(researchContext.mainWord.word, researchData)

  const { result, usage } = await generateEtymologyResponse(userPrompt)

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
  if (researchContext.mainWord.freeDictionary) {
    sources.push({
      name: 'freeDictionary',
      url: `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(mainWord)}`,
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

  // Validate the fully enriched result (sources, confidence, evidence all populated)
  const validated = EtymologyResultSchema.safeParse(result)
  if (!validated.success) {
    const issue = validated.error.issues[0]
    console.error(
      '[Claude] Schema validation failed after enrichment:',
      JSON.stringify({ message: issue?.message, path: issue?.path, code: issue?.code })
    )
    throw new Error(`Schema validation failed: ${issue?.message} at ${issue?.path?.join('.')}`)
  }

  return { result: validated.data as EtymologyResult, usage }
}

/**
 * Stream etymology synthesis from research context, emitting tokens via callback.
 * Accumulates the full response and returns enriched result with token usage.
 * Reuses enrichment logic from synthesizeFromResearch().
 */
export async function streamSynthesis(
  researchContext: ResearchContext,
  onToken: (token: string) => void
): Promise<SynthesisResult> {
  const apiKey = getEnv().ANTHROPIC_API_KEY
  const client = new Anthropic({ apiKey, timeout: CONFIG.timeouts.llm })

  const researchData = buildResearchPrompt(researchContext)
  const userPrompt = buildRichUserPrompt(researchContext.mainWord.word, researchData)

  let fullText = ''
  let inputTokens = 0
  let outputTokens = 0

  try {
    const stream = await client.messages.stream({
      model: CONFIG.model,
      max_tokens: CONFIG.synthesisMaxTokens,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema: ETYMOLOGY_SCHEMA,
        },
      },
    })

    // Accumulate tokens and emit via callback
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const token = event.delta.text
        fullText += token
        onToken(token)
      } else if (event.type === 'message_start' && event.message.usage) {
        inputTokens = event.message.usage.input_tokens
      } else if (event.type === 'message_delta' && event.usage) {
        outputTokens = event.usage.output_tokens
      }
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    throw new Error(`Streaming failed: ${errorMsg}`)
  }

  // Parse accumulated response
  let result: EtymologyResult
  try {
    const raw = JSON.parse(fullText)
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Expected JSON object, got ${typeof raw}`)
    }
    result = raw as EtymologyResult
    sanitizeSuggestions(result)
  } catch (e) {
    const preview = fullText.slice(0, 200)
    throw new Error(`Failed to parse streamed LLM response: ${e}. Preview: ${preview}`)
  }

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
  if (researchContext.mainWord.freeDictionary) {
    sources.push({
      name: 'freeDictionary',
      url: `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(mainWord)}`,
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

  // Validate the fully enriched result
  const validated = EtymologyResultSchema.safeParse(result)
  if (!validated.success) {
    const issue = validated.error.issues[0]
    console.error(
      '[Claude] Schema validation failed after streaming enrichment:',
      JSON.stringify({ message: issue?.message, path: issue?.path, code: issue?.code })
    )
    throw new Error(`Schema validation failed: ${issue?.message} at ${issue?.path?.join('.')}`)
  }

  return {
    result: validated.data as EtymologyResult,
    usage: { inputTokens, outputTokens },
  }
}
