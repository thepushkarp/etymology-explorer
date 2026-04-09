import { EtymologyResult, SourceReference, ResearchContext } from './types'
import { SYSTEM_PROMPT, buildRichUserPrompt } from './prompts'
import { buildResearchPrompt } from './research'
import { enrichAncestryGraph, pruneUngroundedStages } from './etymologyEnricher'
import { EtymologyResultSchema } from './schemas/etymology'
import { CONFIG } from './config'
import {
  buildSynthesisRequest,
  createOpenRouterResponse,
  extractOutputText,
  extractUsage,
  streamOpenRouterResponse,
} from './openrouterResponses'

export interface SynthesisResult {
  result: EtymologyResult
  usage: { inputTokens: number; outputTokens: number }
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

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const maybe = error as { name?: unknown; message?: unknown; cause?: unknown }
  if (maybe.name === 'AbortError') {
    return true
  }

  if (typeof maybe.message === 'string' && maybe.message.toLowerCase().includes('abort')) {
    return true
  }

  if (maybe.cause && typeof maybe.cause === 'object') {
    const cause = maybe.cause as { name?: unknown; message?: unknown }
    if (cause.name === 'AbortError') {
      return true
    }

    if (typeof cause.message === 'string' && cause.message.toLowerCase().includes('abort')) {
      return true
    }
  }

  return false
}

function timeoutErrorMessage(timeoutMs: number): string {
  return `OpenRouter request timeout after ${timeoutMs}ms`
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

/**
 * Sanitize a suggestion word: strip parenthetical annotations, descriptions,
 * em-dashes, and other noise the LLM may include despite instructions.
 * Returns just the word itself.
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

function sanitizeSuggestions(result: EtymologyResult): void {
  if (!result.suggestions) return

  const fields = ['synonyms', 'antonyms', 'homophones', 'easilyConfusedWith', 'seeAlso'] as const

  for (const field of fields) {
    const arr = result.suggestions[field]
    if (arr) {
      result.suggestions[field] = arr.map(sanitizeSuggestionWord).filter((word) => word.length > 0)
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

async function callLlm(userPrompt: string): Promise<{
  text: string
  usage: { inputTokens: number; outputTokens: number }
}> {
  const request = buildSynthesisRequest(userPrompt)
  request.instructions = SYSTEM_PROMPT

  let response
  try {
    response = await createOpenRouterResponse(request, CONFIG.timeouts.llm)
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new Error(timeoutErrorMessage(CONFIG.timeouts.llm))
    }
    throw error
  }

  return {
    text: extractOutputText(response),
    usage: extractUsage(response),
  }
}

async function generateEtymologyResponse(userPrompt: string): Promise<{
  result: EtymologyResult
  usage: { inputTokens: number; outputTokens: number }
}> {
  const totalUsage = { inputTokens: 0, outputTokens: 0 }
  const maxAttempts = CONFIG.retries.malformedOutputRetries + 1
  let lastMalformedError: MalformedModelOutputError | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const { text, usage } = await callLlm(userPrompt)

      try {
        const result = parseGeneratedJson(text)
        sanitizeSuggestions(result)
        addUsage(totalUsage, usage)
        return { result, usage: totalUsage }
      } catch (error) {
        const preview = text.slice(0, 200)
        throw new MalformedModelOutputError(
          `Failed to parse LLM response: ${error}. Preview: ${preview}`,
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
          '[LLM] Retrying malformed model output',
          JSON.stringify({ attempt: attempt + 1 })
        )
      }
    }
  }

  throw lastMalformedError ?? new Error('Failed to parse LLM response after retries')
}

function attachSources(result: EtymologyResult, researchContext: ResearchContext): EtymologyResult {
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
    if (
      rootData.etymonlineData &&
      !sources.some((source) => source.url === rootData.etymonlineData?.url)
    ) {
      sources.push({ name: 'etymonline', url: rootData.etymonlineData.url, word: rootData.root })
    }
    if (
      rootData.wiktionaryData &&
      !sources.some((source) => source.url === rootData.wiktionaryData?.url)
    ) {
      sources.push({ name: 'wiktionary', url: rootData.wiktionaryData.url, word: rootData.root })
    }
  }
  if (sources.length === 0) {
    sources.push({ name: 'synthesized' })
  }

  result.sources = sources
  return result
}

function finalizeResult(
  result: EtymologyResult,
  researchContext: ResearchContext,
  phase: 'standard' | 'streaming'
): EtymologyResult {
  sanitizeModernUsage(result, researchContext)

  if (researchContext.parsedChains && researchContext.parsedChains.length > 0) {
    enrichAncestryGraph(result.ancestryGraph, researchContext.parsedChains)
    const pruned = pruneUngroundedStages(result.ancestryGraph)
    if (pruned > 0) {
      console.warn(
        `[LLM] Pruned ${pruned} ungrounded reconstructed stage(s) for "${researchContext.mainWord.word}"`
      )
    }
  }

  attachSources(result, researchContext)

  const validated = EtymologyResultSchema.safeParse(result)
  if (!validated.success) {
    const issue = validated.error.issues[0]
    console.error(
      `[LLM] Schema validation failed after ${phase} enrichment:`,
      JSON.stringify({ message: issue?.message, path: issue?.path, code: issue?.code })
    )
    throw new Error(`Schema validation failed: ${issue?.message} at ${issue?.path?.join('.')}`)
  }

  return validated.data as EtymologyResult
}

export async function synthesizeFromResearch(
  researchContext: ResearchContext
): Promise<SynthesisResult> {
  const researchData = buildResearchPrompt(researchContext)
  const userPrompt = buildRichUserPrompt(researchContext.mainWord.word, researchData)

  const { result, usage } = await generateEtymologyResponse(userPrompt)

  return {
    result: finalizeResult(result, researchContext, 'standard'),
    usage,
  }
}

export async function streamSynthesis(
  researchContext: ResearchContext,
  onToken: (token: string) => void
): Promise<SynthesisResult> {
  const researchData = buildResearchPrompt(researchContext)
  const userPrompt = buildRichUserPrompt(researchContext.mainWord.word, researchData)
  const request = buildSynthesisRequest(userPrompt)
  request.instructions = SYSTEM_PROMPT

  let fullText = ''
  let usage = { inputTokens: 0, outputTokens: 0 }

  try {
    const response = await streamOpenRouterResponse(
      request,
      (token) => {
        fullText += token
        onToken(token)
      },
      CONFIG.timeouts.llm
    )

    const responseText = extractOutputText(response)
    if (!fullText) {
      fullText = responseText
    }
    usage = extractUsage(response)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Streaming failed: ${errorMessage}`)
  }

  let result: EtymologyResult
  try {
    result = parseGeneratedJson(fullText)
    sanitizeSuggestions(result)
  } catch (error) {
    const preview = fullText.slice(0, 200)
    const parseError = new MalformedModelOutputError(
      `Failed to parse streamed LLM response: ${error}. Preview: ${preview}`,
      usage
    )

    if (CONFIG.retries.malformedOutputRetries < 1) {
      throw parseError
    }

    console.warn('[LLM] Streaming output malformed, retrying with unary generation')

    const recovered = await generateEtymologyResponse(userPrompt)
    result = recovered.result
    addUsage(usage, recovered.usage)
  }

  return {
    result: finalizeResult(result, researchContext, 'streaming'),
    usage,
  }
}
