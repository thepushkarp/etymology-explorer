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

/**
 * JSON Schema for etymology result - used for structured outputs
 * Supports 1 to many roots (dynamic based on word composition)
 */
const ETYMOLOGY_SCHEMA = {
  type: 'object',
  properties: {
    word: { type: 'string', description: 'The word being analyzed' },
    pronunciation: { type: 'string', description: 'IPA pronunciation' },
    definition: { type: 'string', description: 'Brief 5-10 word definition' },
    roots: {
      type: 'array',
      description:
        'All constituent roots (1 for simple words, 2+ for compounds like telephone, autobiography)',
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
          ancestorRoots: {
            type: 'array',
            items: { type: 'string' },
            description: 'Older forms like PIE roots',
          },
          descendantWords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Modern derivatives in other languages',
          },
        },
        required: ['root', 'origin', 'meaning', 'relatedWords'],
        additionalProperties: false,
      },
    },
    ancestryPath: {
      type: 'array',
      description: "The word's journey through languages/time, 3-6 stages",
      items: {
        type: 'object',
        properties: {
          stage: {
            type: 'string',
            description: 'Language/period: PIE, Greek, Latin, Old French, etc.',
          },
          form: { type: 'string', description: 'The word form at this stage' },
          note: {
            type: 'string',
            description: 'Brief annotation about meaning/context at this stage',
          },
        },
        required: ['stage', 'form', 'note'],
        additionalProperties: false,
      },
    },
    lore: {
      type: 'string',
      description:
        'Revelationary 4-6 sentence narrative with aha moments, not mechanical fact-listing',
    },
    sources: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of sources used',
    },
  },
  required: ['word', 'pronunciation', 'definition', 'roots', 'ancestryPath', 'lore', 'sources'],
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

  // Call the appropriate provider
  let responseText: string
  if (llmConfig.provider === 'openrouter') {
    responseText = await callOpenRouter(userPrompt, llmConfig)
  } else {
    responseText = await callAnthropic(userPrompt, llmConfig)
  }

  // Parse JSON response (should always be valid with structured outputs)
  const result = JSON.parse(responseText) as EtymologyResult

  // Build sources array with URLs from research context
  const sources: SourceReference[] = []
  if (researchContext.mainWord.etymonline) {
    sources.push({ name: 'etymonline', url: researchContext.mainWord.etymonline.url })
  }
  if (researchContext.mainWord.wiktionary) {
    sources.push({ name: 'wiktionary', url: researchContext.mainWord.wiktionary.url })
  }
  // Add sources from root research
  for (const rootData of researchContext.rootResearch) {
    if (rootData.etymonlineData && !sources.some((s) => s.url === rootData.etymonlineData?.url)) {
      sources.push({ name: 'etymonline', url: rootData.etymonlineData.url })
    }
    if (rootData.wiktionaryData && !sources.some((s) => s.url === rootData.wiktionaryData?.url)) {
      sources.push({ name: 'wiktionary', url: rootData.wiktionaryData.url })
    }
  }
  if (sources.length === 0) {
    sources.push({ name: 'synthesized' })
  }
  result.sources = sources

  return result
}
