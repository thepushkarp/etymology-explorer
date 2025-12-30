import Anthropic from '@anthropic-ai/sdk'
import { EtymologyResult, RawSourceData, SourceReference, LLMConfig } from './types'
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts'

/**
 * JSON Schema for etymology result - used for structured outputs
 */
const ETYMOLOGY_SCHEMA = {
  type: 'object',
  properties: {
    word: { type: 'string', description: 'The word being analyzed' },
    pronunciation: { type: 'string', description: 'IPA pronunciation' },
    definition: { type: 'string', description: 'Brief 5-10 word definition' },
    roots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          root: { type: 'string', description: 'Root morpheme' },
          origin: { type: 'string', description: 'Language of origin' },
          meaning: { type: 'string', description: 'What this root means' },
          relatedWords: {
            type: 'array',
            items: { type: 'string' },
            description: '6-8 GRE-level words sharing this root',
          },
        },
        required: ['root', 'origin', 'meaning', 'relatedWords'],
        additionalProperties: false,
      },
    },
    lore: { type: 'string', description: '2-3 sentences of memorable etymology narrative' },
    sources: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of sources used',
    },
  },
  required: ['word', 'pronunciation', 'definition', 'roots', 'lore', 'sources'],
  additionalProperties: false,
} as const

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
      max_tokens: 1024,
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
    max_tokens: 1024,
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

  // Call the appropriate provider
  let responseText: string
  if (llmConfig.provider === 'openrouter') {
    responseText = await callOpenRouter(userPrompt, llmConfig)
  } else {
    responseText = await callAnthropic(userPrompt, llmConfig)
  }

  // Parse JSON response (should always be valid with structured outputs)
  const result = JSON.parse(responseText) as EtymologyResult

  // Build sources array with URLs
  const sources: SourceReference[] = []
  if (sourceData.etymonline) {
    sources.push({ name: 'etymonline', url: sourceData.etymonline.url })
  }
  if (sourceData.wiktionary) {
    sources.push({ name: 'wiktionary', url: sourceData.wiktionary.url })
  }
  if (sources.length === 0) {
    sources.push({ name: 'synthesized' })
  }
  result.sources = sources

  return result
}
