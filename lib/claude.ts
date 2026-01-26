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
// Schema for a single ancestry stage
const ANCESTRY_STAGE_SCHEMA = {
  type: 'object',
  properties: {
    stage: { type: 'string', description: 'Language/period: PIE, Greek, Latin, etc.' },
    form: { type: 'string', description: 'The word form at this stage' },
    note: { type: 'string', description: 'Brief annotation about meaning/context' },
  },
  required: ['stage', 'form', 'note'],
  additionalProperties: false,
}

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
    ancestryGraph: {
      type: 'object',
      description: 'Graph showing how roots evolved independently then merged',
      properties: {
        branches: {
          type: 'array',
          description: 'Independent evolution paths for each root',
          items: {
            type: 'object',
            properties: {
              root: { type: 'string', description: 'The root this branch traces' },
              stages: {
                type: 'array',
                items: ANCESTRY_STAGE_SCHEMA,
                description: 'Evolution stages for this root',
              },
            },
            required: ['root', 'stages'],
            additionalProperties: false,
          },
        },
        convergencePoints: {
          type: 'array',
          description: 'Where branches share deep PIE ancestors',
          items: {
            type: 'object',
            properties: {
              pieRoot: { type: 'string', description: 'The shared Proto-Indo-European root' },
              meaning: { type: 'string', description: 'What the PIE root meant' },
              branchIndices: {
                type: 'array',
                items: { type: 'integer' },
                description: 'Which branches (by index) share this ancestor',
              },
            },
            required: ['pieRoot', 'meaning', 'branchIndices'],
            additionalProperties: false,
          },
        },
        mergePoint: {
          type: 'object',
          description: 'Where branches combine (for compound words)',
          properties: {
            form: { type: 'string', description: 'The combined form' },
            note: { type: 'string', description: 'Context about the combination' },
          },
          required: ['form', 'note'],
          additionalProperties: false,
        },
        postMerge: {
          type: 'array',
          items: ANCESTRY_STAGE_SCHEMA,
          description: 'Evolution after merge (optional)',
        },
      },
      required: ['branches'],
      additionalProperties: false,
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
    partsOfSpeech: {
      type: 'array',
      description: 'Definitions per grammatical category (noun, verb, etc.)',
      items: {
        type: 'object',
        properties: {
          pos: {
            type: 'string',
            enum: [
              'noun',
              'verb',
              'adjective',
              'adverb',
              'preposition',
              'conjunction',
              'pronoun',
              'interjection',
              'determiner',
            ],
            description: 'Part of speech',
          },
          definition: { type: 'string', description: 'Definition for this POS' },
          pronunciation: {
            type: 'string',
            description: 'IPA pronunciation if different per POS (e.g., REcord vs reCORD)',
          },
        },
        required: ['pos', 'definition'],
        additionalProperties: false,
      },
    },
    suggestions: {
      type: 'object',
      description: 'Related words for vocabulary building',
      properties: {
        synonyms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Words with similar meaning',
        },
        antonyms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Words with opposite meaning',
        },
        homophones: {
          type: 'array',
          items: { type: 'string' },
          description: 'Words that sound alike',
        },
        easilyConfusedWith: {
          type: 'array',
          items: { type: 'string' },
          description: 'Commonly confused words (e.g., affect/effect)',
        },
        seeAlso: {
          type: 'array',
          items: { type: 'string' },
          description: 'Other interesting related words',
        },
      },
      additionalProperties: false,
    },
    modernUsage: {
      type: 'object',
      description: 'Contemporary and slang usage context',
      properties: {
        hasSlangMeaning: { type: 'boolean', description: 'Whether word has modern slang meaning' },
        slangDefinition: { type: 'string', description: 'The slang/contemporary definition' },
        popularizedBy: { type: 'string', description: 'What popularized the modern usage' },
        contexts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Cultural contexts where slang is used',
        },
        notableReferences: {
          type: 'array',
          items: { type: 'string' },
          description: 'Famous uses in media/literature',
        },
      },
      required: ['hasSlangMeaning'],
      additionalProperties: false,
    },
  },
  required: ['word', 'pronunciation', 'definition', 'roots', 'ancestryGraph', 'lore', 'sources'],
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

  // Call the appropriate provider
  let responseText: string
  if (llmConfig.provider === 'openrouter') {
    responseText = await callOpenRouter(userPrompt, llmConfig)
  } else {
    responseText = await callAnthropic(userPrompt, llmConfig)
  }

  // Parse JSON response (should always be valid with structured outputs)
  const result = JSON.parse(responseText) as EtymologyResult

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
