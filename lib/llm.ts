import { canonicalizeWord, sameSpelling } from './orthography'
import {
  AncestryGraph,
  EtymologyResult,
  LlmUsage,
  SourceReference,
  ResearchContext,
  ModernUsage,
  ResultText,
  LexicalHistory,
} from './types'
import {
  SYSTEM_PROMPT,
  buildBetaSystemPrompt,
  buildBetaUserPrompt,
  buildRichUserPrompt,
} from './prompts'
import { buildResearchPrompt } from './research'
import { enrichAncestryGraph, pruneUngroundedStages } from './etymologyEnricher'
import {
  BetaEtymologyResultSchema,
  EnglishHistoryEtymologyResultSchema,
  EtymologyResultSchema,
} from './schemas/etymology'
import { stripNullsDeep } from './schemas/llm-schema'
import { createSectionScanner } from './sectionScanner'
import { CONFIG } from './config'
import {
  assertCompleteResponse,
  buildSynthesisRequest,
  createOpenRouterResponse,
  extractOutputText,
  extractUsage,
  streamOpenRouterResponse,
} from './openrouterResponses'
import { LANGUAGES, type LanguageCode } from './languages'

export interface SynthesisResult {
  result: EtymologyResult
  usage: LlmUsage
}

class MalformedModelOutputError extends Error {
  readonly usage: LlmUsage

  constructor(message: string, usage: LlmUsage) {
    super(message)
    this.name = 'MalformedModelOutputError'
    this.usage = usage
  }
}

function isMalformedModelOutputError(error: unknown): error is MalformedModelOutputError {
  return error instanceof MalformedModelOutputError
}

/**
 * Extract the LLM usage attached to a synthesis error, if any. Errors thrown
 * AFTER the model ran (malformed output, post-processing schema failures)
 * carry the billed usage so callers can still record the spend; transport
 * errors (timeouts, aborts) carry none.
 */
export function getLlmUsageFromError(error: unknown): LlmUsage | undefined {
  if (!error || typeof error !== 'object' || !('usage' in error)) {
    return undefined
  }

  const usage = (error as { usage?: unknown }).usage
  if (!usage || typeof usage !== 'object') {
    return undefined
  }

  const maybe = usage as { inputTokens?: unknown; outputTokens?: unknown }
  if (typeof maybe.inputTokens !== 'number' || typeof maybe.outputTokens !== 'number') {
    return undefined
  }

  return usage as LlmUsage
}

function addUsage(total: LlmUsage, delta: LlmUsage): void {
  total.inputTokens += delta.inputTokens
  total.outputTokens += delta.outputTokens
  if (delta.costUSD !== undefined) {
    total.costUSD = (total.costUSD ?? 0) + delta.costUSD
  }
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
    const match = text.match(/^[\p{L}\p{M}'’ʼ‐‑-]+(?:\s[\p{L}\p{M}'’ʼ‐‑-]+)?/u)
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

  // Beta research deliberately excludes slang-only English sources.
  if (result.language && result.language !== 'en') {
    result.modernUsage = { hasSlangMeaning: false }
    return
  }
  const englishUsage = modernUsage as ModernUsage<string>

  const supplementalSignals = getSupplementalSourceSignals(researchContext)
  const hasSupplementalSlangEvidence =
    supplementalSignals.urbanDictionary || supplementalSignals.incelsWiki
  if (!hasSupplementalSlangEvidence) {
    result.modernUsage = { hasSlangMeaning: false }
    return
  }

  const compact = (value: string) => value.replace(/\s+/g, ' ').trim()
  const slangDefinition = englishUsage.slangDefinition ? compact(englishUsage.slangDefinition) : ''
  const popularizedBy = englishUsage.popularizedBy ? compact(englishUsage.popularizedBy) : ''
  const contexts = dedupeStrings(
    (englishUsage.contexts ?? [])
      .map(compact)
      .filter((context) => context.length >= 3 && context.length <= 50)
  ).slice(0, 4)
  const notableReferences = dedupeStrings(
    (englishUsage.notableReferences ?? [])
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

interface SynthesisOptions {
  model?: string
  signal?: AbortSignal
  language?: LanguageCode
  sourceHistories?: boolean
  /**
   * Streams the LLM response and fires once per closed top-level field of
   * the response JSON, in schema (render) order — ~10 events per response.
   * Presence of this callback selects the streaming transport; the
   * streaming path does not retry malformed output, because sections
   * already on the wire cannot be retracted.
   */
  onSection?: (section: string, data: unknown) => void
}

async function callLlm(
  userPrompt: string,
  options?: SynthesisOptions
): Promise<{
  text: string
  usage: LlmUsage
}> {
  const language = options?.language ?? 'en'
  const request = buildSynthesisRequest(
    userPrompt,
    options?.model,
    language,
    options?.sourceHistories
  )
  request.instructions =
    language === 'en'
      ? SYSTEM_PROMPT
      : buildBetaSystemPrompt(LANGUAGES[language].englishName, language)
  const onSection = options?.onSection

  try {
    if (!onSection) {
      const response = await createOpenRouterResponse(request, CONFIG.timeouts.llm, options?.signal)
      return { text: extractOutputText(response), usage: extractUsage(response) }
    }

    const scanner = createSectionScanner((section, data) => {
      onSection(section, stripNullsDeep(data))
    })

    let streamedText = ''
    const response = await streamOpenRouterResponse(
      request,
      (token) => {
        streamedText += token
        scanner.push(token)
      },
      CONFIG.timeouts.llm,
      options?.signal
    )

    assertCompleteResponse(response)
    if (streamedText.length === 0) {
      // Some providers deliver the text only in the final response event;
      // feed it through the scanner so section events still fire.
      streamedText = extractOutputText(response)
      scanner.push(streamedText)
    }

    return { text: streamedText, usage: extractUsage(response) }
  } catch (error) {
    if (options?.signal?.aborted) {
      throw error // caller-initiated cancellation, not a timeout
    }
    if (isAbortLikeError(error)) {
      throw new Error(timeoutErrorMessage(CONFIG.timeouts.llm))
    }
    throw error
  }
}

async function generateEtymologyResponse(
  userPrompt: string,
  options?: SynthesisOptions,
  malformedAttemptLimit?: number
): Promise<{
  result: EtymologyResult
  usage: LlmUsage
}> {
  const totalUsage: LlmUsage = { inputTokens: 0, outputTokens: 0 }
  // json_schema strict mode makes malformed output rare. The unary path
  // keeps one retry as a safety net; the streaming path fails fast — its
  // section events are already on the wire and cannot be retracted.
  const maxAttempts =
    malformedAttemptLimit ?? (options?.onSection ? 1 : CONFIG.retries.malformedOutputRetries + 1)
  let lastMalformedError: MalformedModelOutputError | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const { text, usage } = await callLlm(userPrompt, options)

      try {
        // Strict mode encodes optional fields as null — decode to the app's
        // canonical absent-field shape before sanitizers and Zod see it.
        const result = stripNullsDeep(parseGeneratedJson(text))
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
        const failedUsage = getLlmUsageFromError(error)
        if (failedUsage) addUsage(totalUsage, failedUsage)
        if (error instanceof Error) Object.assign(error, { usage: totalUsage })
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

  // Re-wrap with the usage accumulated across ALL attempts (the stored
  // error only carries the final attempt's), so the caller records the
  // full spend of a failed synthesis.
  throw lastMalformedError
    ? new MalformedModelOutputError(lastMalformedError.message, totalUsage)
    : new Error('Failed to parse LLM response after retries')
}

export function isRecoverableBetaValidationError(error: unknown, language: LanguageCode): boolean {
  return (
    language !== 'en' &&
    error instanceof Error &&
    error.message.startsWith('Schema validation failed:') &&
    !isAbortLikeError(error)
  )
}

function attachSources(result: EtymologyResult, researchContext: ResearchContext): EtymologyResult {
  const sources: SourceReference[] = []
  const supplementalSignals = getSupplementalSourceSignals(researchContext)
  const mainWord = researchContext.mainWord.word
  const language = researchContext.language ?? 'en'

  if (language !== 'en') {
    const betaSources = [
      ['wiktionaryEnglish', researchContext.mainWord.wiktionaryEnglish, 'wiktionary'],
      ['wiktionaryNative', researchContext.mainWord.wiktionaryNative, 'wiktionary'],
      ['wikidataLexeme', researchContext.mainWord.wikidataLexeme, 'wikidata'],
      ['multilingualDictionary', researchContext.mainWord.multilingualDictionary, 'wiktionary'],
      ['dicionarioAberto', researchContext.mainWord.dicionarioAberto, 'dicionarioAberto'],
    ] as const

    for (const [name, data, sourceFamily] of betaSources) {
      if (data) {
        sources.push({
          name,
          url: data.url,
          word: mainWord,
          sourceFamily,
          ...(name === 'multilingualDictionary'
            ? { license: 'Per-entry attribution and license are provided by FreeDictionaryAPI' }
            : {}),
        })
      }
    }
    if (researchContext.mainWord.wikipedia) {
      sources.push({
        name: 'wikipedia',
        url: researchContext.mainWord.wikipedia.url,
        word: mainWord,
      })
    }
    for (const root of researchContext.rootResearch) {
      for (const [name, data] of [
        ['wiktionary', root.wiktionaryData],
        ['wiktionaryEnglish', root.wiktionaryEnglish],
        ['wiktionaryNative', root.wiktionaryNative],
      ] as const) {
        if (data && !sources.some((source) => source.url === data.url)) {
          sources.push({
            name,
            url: data.url,
            word: root.lexeme?.word ?? root.root,
            sourceFamily: 'wiktionary',
          })
        }
      }
    }
    result.sources = sources.length > 0 ? sources : [{ name: 'synthesized' }]
    return result
  }

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
  if (researchContext.mainWord.wikipedia) {
    sources.push({
      name: 'wikipedia',
      url: researchContext.mainWord.wikipedia.url,
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
  for (const relatedData of researchContext.relatedResearch) {
    if (
      relatedData.etymonlineData &&
      !sources.some((source) => source.url === relatedData.etymonlineData?.url)
    ) {
      sources.push({
        name: 'etymonline',
        url: relatedData.etymonlineData.url,
        word: relatedData.term,
      })
    }
  }
  if (sources.length === 0) {
    sources.push({ name: 'synthesized' })
  }

  result.sources = sources
  return result
}

function sameStrings(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const sortedRight = [...right].sort()
  return [...left].sort().every((value, index) => value === sortedRight[index])
}

/** Reject cross-history topology before any evidence-bearing English section is published. */
function validateEnglishHistoryGraph(
  history: LexicalHistory<string>,
  context: ResearchContext
): void {
  const entry = context.entryContexts?.find((candidate) => candidate.id === history.id)
  if (!entry) throw new Error('Schema validation failed: source history context is missing')
  const graph = history.ancestryGraph
  // Only this history and its explicit spelling/redirect targets can establish
  // lexical evidence; unrelated component lookups remain independent context.
  const identityTexts = [
    entry.text,
    ...context.rootResearch
      .filter(
        (root) =>
          root.parentHistoryId === history.id &&
          (root.relationship === 'spelling-variant' || root.relationship === 'redirect')
      )
      .flatMap((root) => [root.etymonlineData?.text, root.wiktionaryData?.text])
      .filter((text): text is string => Boolean(text)),
  ]
  const scopedLinks = (context.parsedChains ?? [])
    .filter((chain) => chain.historyId === history.id)
    .flatMap((chain) => chain.links)
  const foreignLinks = (context.parsedChains ?? [])
    .filter((chain) => chain.historyId && chain.historyId !== history.id)
    .flatMap((chain) => chain.links)
  const forms = [
    ...graph.branches.flatMap((branch) => branch.stages.map((stage) => stage.form)),
    ...(graph.postMerge ?? []).map((stage) => stage.form),
    ...(graph.mergePoint ? [graph.mergePoint.form] : []),
  ]
  for (const form of forms) {
    if (
      foreignLinks.some((link) => sameSpelling(link.form, form)) &&
      !scopedLinks.some((link) => sameSpelling(link.form, form)) &&
      !identityTexts.some((text) => canonicalizeWord(text).includes(canonicalizeWord(form)))
    ) {
      throw new Error('Schema validation failed: ancestry stage belongs to another history')
    }
  }
  const paths = new Set<string>()
  for (const branch of graph.branches) {
    const path = JSON.stringify(
      branch.stages.map((stage) => [canonicalizeWord(stage.stage), canonicalizeWord(stage.form)])
    )
    if (paths.has(path)) throw new Error('Schema validation failed: duplicated ancestry branch')
    paths.add(path)
    if (
      graph.mergePoint &&
      graph.branches.length > 1 &&
      (sameSpelling(branch.root, context.mainWord.word) ||
        sameSpelling(branch.root, graph.mergePoint.form) ||
        branch.stages.some(
          (stage) =>
            sameSpelling(stage.form, context.mainWord.word) ||
            sameSpelling(stage.form, graph.mergePoint!.form)
        ))
    ) {
      throw new Error('Schema validation failed: whole compound duplicated in component ancestry')
    }
  }
}

function finalizeHistories(
  result: Pick<
    LexicalHistory<ResultText>,
    'pronunciation' | 'definition' | 'roots' | 'ancestryGraph' | 'lore' | 'partsOfSpeech'
  > & { primaryHistoryId: string; histories: LexicalHistory<ResultText>[] },
  researchContext: ResearchContext
): void {
  const candidates = researchContext.lexicalGraph?.histories ?? []
  if (candidates.length === 0) {
    throw new Error('Schema validation failed: research has no entry histories')
  }

  if (!Array.isArray(result.histories)) {
    throw new Error('Schema validation failed: source-defined histories are missing')
  }
  const returnedIds = result.histories.map((history) => history.id)
  const expectedIds = candidates.map((history) => history.id)
  if (!sameStrings(returnedIds, expectedIds)) {
    throw new Error('Schema validation failed: model changed the source-defined history set')
  }
  if (result.primaryHistoryId !== expectedIds[0]) {
    throw new Error('Schema validation failed: primary history must be the first source history')
  }

  for (const history of result.histories) {
    const candidate = candidates.find((entry) => entry.id === history.id)
    const formOfMatches = candidate?.formOf
      ? history.formOf?.word === candidate.formOf.word &&
        history.formOf.language === candidate.formOf.language
      : history.formOf === undefined
    if (
      !candidate ||
      history.queryNodeId !== candidate.queryNodeId ||
      history.lemmaNodeId !== candidate.lemmaNodeId ||
      history.entryKind !== candidate.entryKind ||
      !formOfMatches ||
      !sameStrings(history.evidenceScopeIds, candidate.evidenceScopeIds)
    ) {
      throw new Error(`Schema validation failed: history identity changed for ${history.id}`)
    }

    if ((researchContext.language ?? 'en') === 'en') {
      validateEnglishHistoryGraph(history as LexicalHistory<string>, researchContext)
    }
    const scopedChains = (researchContext.parsedChains ?? []).filter(
      (chain) =>
        chain.historyId === history.id &&
        Boolean(chain.evidenceScopeId) &&
        history.evidenceScopeIds.includes(chain.evidenceScopeId as string)
    )
    enrichAncestryGraph(history.ancestryGraph, scopedChains)
    pruneUngroundedStages(history.ancestryGraph)
    // Distinct unsupported roots can collapse into identical surviving paths.
    if ((researchContext.language ?? 'en') === 'en') {
      validateEnglishHistoryGraph(history as LexicalHistory<string>, researchContext)
    }
  }

  const primary = result.histories.find((history) => history.id === result.primaryHistoryId)
  if (!primary) {
    throw new Error('Schema validation failed: primary history is missing')
  }
  result.pronunciation = primary.pronunciation
  result.definition = primary.definition
  result.roots = primary.roots
  result.ancestryGraph = primary.ancestryGraph
  result.lore = primary.lore
  result.partsOfSpeech = primary.partsOfSpeech
}

export function finalizeResult(
  result: EtymologyResult,
  researchContext: ResearchContext,
  phase: 'standard' | 'streaming'
): EtymologyResult {
  const requestedWord = researchContext.mainWord.word
  if (typeof result.word !== 'string' || !sameSpelling(result.word, requestedWord)) {
    throw new Error(
      `Schema validation failed: synthesis changed requested spelling "${requestedWord}" to "${result.word}"`
    )
  }
  if ((result.language ?? 'en') !== (researchContext.language ?? 'en')) {
    throw new Error('Schema validation failed: synthesis changed requested language')
  }
  sanitizeModernUsage(result, researchContext)

  if (
    researchContext.lexicalGraph?.histories.length ||
    (researchContext.language && researchContext.language !== 'en')
  ) {
    finalizeHistories(
      result as EtymologyResult & {
        primaryHistoryId: string
        histories: LexicalHistory<ResultText>[]
      },
      researchContext
    )
  } else {
    const graph = result.ancestryGraph as AncestryGraph<ResultText>
    enrichAncestryGraph(graph, researchContext.parsedChains ?? [])
    const pruned = pruneUngroundedStages(graph)
    if (pruned > 0) {
      console.warn(
        `[LLM] Pruned ${pruned} ungrounded reconstructed stage(s) for "${researchContext.mainWord.word}"`
      )
    }
  }

  attachSources(result, researchContext)

  const validated =
    researchContext.language && researchContext.language !== 'en'
      ? BetaEtymologyResultSchema.safeParse(result)
      : researchContext.lexicalGraph?.histories.length
        ? EnglishHistoryEtymologyResultSchema.safeParse(result)
        : EtymologyResultSchema.safeParse(result)
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

/**
 * Single synthesis entrypoint for both transports: pass `onSection` to
 * stream (section events fire as top-level fields close), omit it for a
 * unary call. Either way the parsed result is enriched, source-attributed,
 * and Zod-validated before it is returned.
 */
export async function synthesizeFromResearch(
  researchContext: ResearchContext,
  options?: SynthesisOptions
): Promise<SynthesisResult> {
  const researchData = buildResearchPrompt(researchContext)
  const language = researchContext.language ?? 'en'
  const userPrompt =
    language === 'en'
      ? buildRichUserPrompt(researchContext.mainWord.word, researchData)
      : buildBetaUserPrompt(
          researchContext.mainWord.word,
          LANGUAGES[language].englishName,
          language,
          researchData
        )

  const totalUsage: LlmUsage = { inputTokens: 0, outputTokens: 0 }
  const sourceHistories = Boolean(researchContext.lexicalGraph?.histories.length)
  const maxValidationAttempts = language === 'en' ? 1 : 2

  for (let attempt = 0; attempt < maxValidationAttempts; attempt += 1) {
    try {
      // Closed histories can be validated and projected before their duplicated
      // top-level fields arrive. Other evidence waits for the finalizer.
      const heldSections = ['ancestryGraph', 'histories', 'primaryHistoryId', 'sources']
      const pendingSections = new Map<string, unknown>()
      const publishedSections = new Set<string>()
      let wordVerified = false
      let languageVerified = language === 'en'
      let identityError: Error | undefined
      const onSection = options?.onSection
        ? (section: string, data: unknown) => {
            if (section === 'word') {
              wordVerified =
                typeof data === 'string' && sameSpelling(data, researchContext.mainWord.word)
              if (!wordVerified)
                identityError = new Error(
                  'Schema validation failed: streamed spelling differs from requested word'
                )
            }
            if (section === 'language') {
              languageVerified = data === language
              if (!languageVerified)
                identityError = new Error(
                  'Schema validation failed: streamed language differs from requested language'
                )
            }
            if (identityError) return
            pendingSections.set(section, data)
            if (sourceHistories && wordVerified && languageVerified) {
              const publish = (name: string, value: unknown) => {
                if (publishedSections.has(name)) return
                publishedSections.add(name)
                if (value !== undefined) options.onSection?.(name, value)
              }
              if (language !== 'en') publish('language', language)
              publish('word', researchContext.mainWord.word)
              if (
                !publishedSections.has('histories') &&
                pendingSections.has('histories') &&
                pendingSections.has('primaryHistoryId')
              ) {
                try {
                  // The history contains every entry field. Reuse the terminal
                  // identity, evidence and schema checks before publishing it.
                  const primary = finalizeResult(
                    {
                      word: researchContext.mainWord.word,
                      language,
                      primaryHistoryId: pendingSections.get('primaryHistoryId'),
                      histories: pendingSections.get('histories'),
                      sources: [],
                    } as unknown as EtymologyResult,
                    researchContext,
                    'streaming'
                  )
                  for (const name of [
                    'primaryHistoryId',
                    'histories',
                    'pronunciation',
                    'definition',
                    'ancestryGraph',
                    'roots',
                    'lore',
                    'partsOfSpeech',
                  ]) {
                    publish(name, (primary as unknown as Record<string, unknown>)[name])
                  }
                } catch (error) {
                  // Drain the provider response even on validation failure so
                  // its completed usage is included in the failed request.
                  identityError = error instanceof Error ? error : new Error(String(error))
                }
              }
              return
            }
            if (
              wordVerified &&
              languageVerified &&
              !heldSections.some((name) => pendingSections.has(name))
            ) {
              for (const [name, value] of pendingSections) options.onSection?.(name, value)
              pendingSections.clear()
            }
          }
        : undefined
      const attemptOptions =
        attempt === 0
          ? { ...options, language, sourceHistories, onSection }
          : { signal: options?.signal, language, sourceHistories }
      const generated = await generateEtymologyResponse(
        userPrompt,
        attemptOptions,
        attempt === 0 ? undefined : 1
      )
      addUsage(totalUsage, generated.usage)

      if (identityError) throw identityError
      const result = finalizeResult(
        generated.result,
        researchContext,
        attempt === 0 && options?.onSection ? 'streaming' : 'standard'
      )
      if (options?.onSection) {
        for (const section of pendingSections.keys()) {
          if (publishedSections.has(section)) continue
          const value = (result as unknown as Record<string, unknown>)[section]
          if (value !== undefined) options.onSection(section, value)
        }
      }
      return { result, usage: totalUsage }
    } catch (error) {
      const errorUsage = getLlmUsageFromError(error)
      if (errorUsage) {
        addUsage(totalUsage, errorUsage)
      }

      if (
        attempt < maxValidationAttempts - 1 &&
        isRecoverableBetaValidationError(error, language)
      ) {
        console.warn(
          '[LLM] Retrying beta synthesis after validation failure',
          JSON.stringify({ word: researchContext.mainWord.word, language })
        )
        continue
      }

      // Validation and malformed-output failures occur after a billable
      // request. Expose the accumulated usage so the route records every
      // attempt, including the failed recovery.
      if (error instanceof Error) {
        ;(error as Error & { usage: LlmUsage }).usage = totalUsage
      }
      throw error
    }
  }

  throw new Error('Beta synthesis exhausted its validation attempts')
}
