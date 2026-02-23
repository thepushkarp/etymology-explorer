import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { EtymologyResult, SourceReference, ResearchContext } from './types'
import { SYSTEM_PROMPT, buildRichUserPrompt } from './prompts'
import { buildResearchPrompt } from './research'
import { enrichAncestryGraph } from './etymologyEnricher'
import { EtymologyResultSchema } from './schemas/etymology'
import { CONFIG } from './config'
import { getEnv } from './env'

export interface SynthesisResult {
  result: EtymologyResult
  usage: { inputTokens: number; outputTokens: number }
}

interface GeminiResponsePart {
  text?: string | null
}

interface GeminiResponseCandidate {
  content?: {
    parts?: GeminiResponsePart[]
  }
}

interface GeminiResponseLike {
  text?: string | null
  candidates?: GeminiResponseCandidate[]
}

interface GeminiGenerationOptions {
  useSearchGrounding: boolean
}

class MalformedModelOutputError extends Error {
  readonly usage: { inputTokens: number; outputTokens: number }

  constructor(message: string, usage: { inputTokens: number; outputTokens: number }) {
    super(message)
    this.name = 'MalformedModelOutputError'
    this.usage = usage
  }
}

function isMalformedModelOutputError(error: unknown): error is MalformedModelOutputError {
  return error instanceof MalformedModelOutputError
}

function addUsage(
  total: { inputTokens: number; outputTokens: number },
  delta: { inputTokens: number; outputTokens: number }
): void {
  total.inputTokens += delta.inputTokens
  total.outputTokens += delta.outputTokens
}

function shouldUseSearchGrounding(
  researchContext: ResearchContext,
  isRetryAttempt: boolean
): boolean {
  if (!CONFIG.grounding.googleSearchEnabled) return false

  if (isRetryAttempt && CONFIG.grounding.enableOnMalformedRetry) {
    return true
  }

  const hasNoParsedChains = (researchContext.parsedChains?.length ?? 0) === 0
  const hasMissingCoreSources =
    !researchContext.mainWord.etymonline ||
    !researchContext.mainWord.wiktionary ||
    !researchContext.mainWord.freeDictionary

  return (
    (CONFIG.grounding.enableWhenNoParsedChains && hasNoParsedChains) ||
    (CONFIG.grounding.enableWhenCoreSourcesMissing && hasMissingCoreSources)
  )
}

function buildGenerationConfig(useSearchGrounding: boolean) {
  return {
    maxOutputTokens: CONFIG.synthesisMaxTokens,
    systemInstruction: SYSTEM_PROMPT,
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    responseMimeType: 'application/json' as const,
    ...(useSearchGrounding ? { tools: [{ googleSearch: {} }] } : {}),
  }
}

function extractUsage(
  usage:
    | {
        promptTokenCount?: number | null
        candidatesTokenCount?: number | null
      }
    | null
    | undefined
): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  }
}

function extractResponseText(response: GeminiResponseLike): string {
  if (response.text && response.text.trim().length > 0) {
    return response.text
  }

  const candidateText = (response.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join('')

  if (candidateText.length > 0) {
    return candidateText
  }

  throw new Error('No text response from Gemini')
}

function extractJsonObjectChunk(text: string): string | null {
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        start = i
      }
      depth += 1
      continue
    }

    if (char === '}') {
      if (depth === 0) {
        continue
      }

      depth -= 1
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

function parseGeneratedJson(text: string): EtymologyResult {
  const candidates: string[] = []
  const trimmed = text.trim()
  if (trimmed.length > 0) {
    candidates.push(trimmed)
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim())
  }

  const objectChunk = extractJsonObjectChunk(text)
  if (objectChunk) {
    candidates.push(objectChunk)
  }

  for (const candidate of candidates) {
    try {
      const raw = JSON.parse(candidate)
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        return raw as EtymologyResult
      }
    } catch {
      continue
    }
  }

  throw new Error('Could not parse a JSON object from model output')
}

async function callGemini(
  userPrompt: string,
  options: GeminiGenerationOptions
): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
  const client = new GoogleGenAI({ apiKey: getEnv().GEMINI_API_KEY })
  const response = await client.models.generateContent({
    model: CONFIG.model,
    contents: userPrompt,
    config: buildGenerationConfig(options.useSearchGrounding),
  })

  return {
    text: extractResponseText(response),
    usage: extractUsage(response.usageMetadata),
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

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}

interface SupplementalSourceSignals {
  urbanDictionary: boolean
  incelsWiki: boolean
}

const MIN_SIGNIFICANT_URBAN_CHARS = 40
const MIN_SIGNIFICANT_INCELS_CHARS = 120
const INCELS_USAGE_SIGNALS =
  /\b(incel|femcel|blackpill|redpill|looksmax|manosphere|internet|slang|term|coined|refers to|used)\b/i

function getSupplementalSourceSignals(researchContext: ResearchContext): SupplementalSourceSignals {
  const urbanText =
    researchContext.mainWord.urbanDictionary?.text?.replace(/\s+/g, ' ').trim() ?? ''
  const incelsText = researchContext.mainWord.incelsWiki?.text?.replace(/\s+/g, ' ').trim() ?? ''

  const urbanDictionary =
    urbanText.length >= MIN_SIGNIFICANT_URBAN_CHARS && /Definition:/i.test(urbanText)
  const incelsWiki =
    incelsText.length >= MIN_SIGNIFICANT_INCELS_CHARS && INCELS_USAGE_SIGNALS.test(incelsText)

  return { urbanDictionary, incelsWiki }
}

/**
 * Keep modern usage grounded: only surface it when we have clear, high-signal evidence.
 * This prevents vague or speculative slang blurbs from showing up in the UI.
 */
function sanitizeModernUsage(result: EtymologyResult, researchContext: ResearchContext): void {
  const modernUsage = result.modernUsage
  if (!modernUsage) return

  if (!modernUsage.hasSlangMeaning) {
    result.modernUsage = { hasSlangMeaning: false }
    return
  }

  const supplementalSignals = getSupplementalSourceSignals(researchContext)
  const hasSupplementalSlangEvidence =
    supplementalSignals.urbanDictionary || supplementalSignals.incelsWiki
  if (!hasSupplementalSlangEvidence) {
    result.modernUsage = { hasSlangMeaning: false }
    return
  }

  const compact = (value: string) => value.replace(/\s+/g, ' ').trim()
  const slangDefinition = modernUsage.slangDefinition ? compact(modernUsage.slangDefinition) : ''
  const popularizedBy = modernUsage.popularizedBy ? compact(modernUsage.popularizedBy) : ''
  const contexts = dedupeStrings(
    (modernUsage.contexts ?? [])
      .map(compact)
      .filter((context) => context.length >= 3 && context.length <= 50)
  ).slice(0, 4)
  const notableReferences = dedupeStrings(
    (modernUsage.notableReferences ?? [])
      .map(compact)
      .filter((reference) => reference.length >= 6 && reference.length <= 140)
  ).slice(0, 3)

  const lowSignalPattern =
    /^slang term$|^internet slang$|^modern slang$|^used online$|^expression$/i
  const definitionWordCount = slangDefinition.split(/\s+/).filter(Boolean).length
  const hasSubstantiveDefinition =
    slangDefinition.length >= 24 &&
    definitionWordCount >= 5 &&
    !lowSignalPattern.test(slangDefinition.toLowerCase())
  const hasContextSignals =
    popularizedBy.length >= 3 || contexts.length > 0 || notableReferences.length > 0

  if (!hasSubstantiveDefinition || !hasContextSignals) {
    result.modernUsage = { hasSlangMeaning: false }
    return
  }

  result.modernUsage = {
    hasSlangMeaning: true,
    slangDefinition,
    ...(popularizedBy ? { popularizedBy } : {}),
    ...(contexts.length > 0 ? { contexts } : {}),
    ...(notableReferences.length > 0 ? { notableReferences } : {}),
  }
}

async function generateEtymologyResponse(
  userPrompt: string,
  researchContext: ResearchContext,
  startInRetryMode = false
): Promise<{ result: EtymologyResult; usage: { inputTokens: number; outputTokens: number } }> {
  const totalUsage = { inputTokens: 0, outputTokens: 0 }
  const maxAttempts = CONFIG.retries.malformedOutputRetries + 1
  let lastMalformedError: MalformedModelOutputError | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const isRetryAttempt = startInRetryMode || attempt > 0
    const useSearchGrounding = shouldUseSearchGrounding(researchContext, isRetryAttempt)

    try {
      const { text, usage } = await callGemini(userPrompt, { useSearchGrounding })

      try {
        const result = parseGeneratedJson(text)
        sanitizeSuggestions(result)
        addUsage(totalUsage, usage)
        return { result, usage: totalUsage }
      } catch (e) {
        const preview = text.slice(0, 200)
        throw new MalformedModelOutputError(
          `Failed to parse LLM response: ${e}. Preview: ${preview}`,
          usage
        )
      }
    } catch (error) {
      if (!isMalformedModelOutputError(error)) {
        throw error
      }

      addUsage(totalUsage, error.usage)
      lastMalformedError = error

      if (attempt < maxAttempts - 1) {
        console.warn(
          '[Gemini] Retrying malformed model output',
          JSON.stringify({ attempt: attempt + 1, useSearchGrounding })
        )
      }
    }
  }

  throw lastMalformedError ?? new Error('Failed to parse LLM response after retries')
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

  const { result, usage } = await generateEtymologyResponse(userPrompt, researchContext)

  sanitizeModernUsage(result, researchContext)

  // Enrich ancestry graph with source evidence and confidence levels
  if (researchContext.parsedChains && researchContext.parsedChains.length > 0) {
    enrichAncestryGraph(result.ancestryGraph, researchContext.parsedChains)
  }

  // Build sources array with URLs and word info from research context
  const sources: SourceReference[] = []
  const supplementalSignals = getSupplementalSourceSignals(researchContext)
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
  if (researchContext.mainWord.urbanDictionary && supplementalSignals.urbanDictionary) {
    sources.push({
      name: 'urbanDictionary',
      url: researchContext.mainWord.urbanDictionary.url,
      word: mainWord,
    })
  }
  if (researchContext.mainWord.incelsWiki && supplementalSignals.incelsWiki) {
    sources.push({
      name: 'incelsWiki',
      url: researchContext.mainWord.incelsWiki.url,
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
      '[Gemini] Schema validation failed after enrichment:',
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
  const client = new GoogleGenAI({ apiKey: getEnv().GEMINI_API_KEY })

  const researchData = buildResearchPrompt(researchContext)
  const userPrompt = buildRichUserPrompt(researchContext.mainWord.word, researchData)
  const useSearchGrounding = shouldUseSearchGrounding(researchContext, false)

  let fullText = ''
  const usage = { inputTokens: 0, outputTokens: 0 }

  try {
    const stream = await client.models.generateContentStream({
      model: CONFIG.model,
      contents: userPrompt,
      config: buildGenerationConfig(useSearchGrounding),
    })

    // Accumulate tokens and emit via callback
    for await (const chunk of stream) {
      const token = chunk.text
      if (token) {
        fullText += token
        onToken(token)
      }

      if (chunk.usageMetadata) {
        const chunkUsage = extractUsage(chunk.usageMetadata)
        usage.inputTokens = chunkUsage.inputTokens
        usage.outputTokens = chunkUsage.outputTokens
      }
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    throw new Error(`Streaming failed: ${errorMsg}`)
  }

  // Parse accumulated response
  let result: EtymologyResult
  try {
    result = parseGeneratedJson(fullText)
    sanitizeSuggestions(result)
  } catch (e) {
    const preview = fullText.slice(0, 200)
    const parseError = new MalformedModelOutputError(
      `Failed to parse streamed LLM response: ${e}. Preview: ${preview}`,
      usage
    )

    if (CONFIG.retries.malformedOutputRetries < 1) {
      throw parseError
    }

    console.warn(
      '[Gemini] Streaming output malformed, retrying with unary generation',
      JSON.stringify({ useSearchGrounding })
    )

    const recovered = await generateEtymologyResponse(userPrompt, researchContext, true)
    result = recovered.result
    addUsage(usage, recovered.usage)
  }

  // Enrich ancestry graph with source evidence and confidence levels
  sanitizeModernUsage(result, researchContext)

  if (researchContext.parsedChains && researchContext.parsedChains.length > 0) {
    enrichAncestryGraph(result.ancestryGraph, researchContext.parsedChains)
  }

  // Build sources array with URLs and word info from research context
  const sources: SourceReference[] = []
  const supplementalSignals = getSupplementalSourceSignals(researchContext)
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
  if (researchContext.mainWord.urbanDictionary && supplementalSignals.urbanDictionary) {
    sources.push({
      name: 'urbanDictionary',
      url: researchContext.mainWord.urbanDictionary.url,
      word: mainWord,
    })
  }
  if (researchContext.mainWord.incelsWiki && supplementalSignals.incelsWiki) {
    sources.push({
      name: 'incelsWiki',
      url: researchContext.mainWord.incelsWiki.url,
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
      '[Gemini] Schema validation failed after streaming enrichment:',
      JSON.stringify({ message: issue?.message, path: issue?.path, code: issue?.code })
    )
    throw new Error(`Schema validation failed: ${issue?.message} at ${issue?.path?.join('.')}`)
  }

  return {
    result: validated.data as EtymologyResult,
    usage,
  }
}
