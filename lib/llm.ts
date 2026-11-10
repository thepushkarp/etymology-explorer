import { canonicalizeWord, sameSpelling } from './orthography'
import { normalizeScriptTargets } from './scriptTargets'
import {
  EtymologyResult,
  LlmUsage,
  SourceReference,
  ResearchContext,
  LexicalHistory,
  AncestryBranch,
  ResearchEntryContext,
  LexemeRef,
} from './types'
import { buildSystemPrompt, buildUserPrompt } from './prompts'
import { buildResearchPrompt } from './research'
import { enrichAncestryGraph, pruneUngroundedStages } from './etymologyEnricher'
import { EtymologyResultSchema } from './schemas/etymology'
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
import {
  LANGUAGES,
  lexicalLanguageName,
  type LanguageCode,
  type EtymologyStratum,
} from './languages'
import type { ParsedEtymChain } from './etymologyParser'
import {
  lexicalSourceRecords,
  mainSourceRecords,
  relatedSourceRecords,
  rootSourceRecords,
  sourceEvidenceRole,
} from './researchSources'

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
  incelsWiki: boolean
  wikipedia: boolean
}

const MIN_SIGNIFICANT_INCELS_CHARS = 120
const MIN_SIGNIFICANT_WIKIPEDIA_CHARS = 120
const INCELS_USAGE_SIGNALS =
  /\b(incel|femcel|blackpill|redpill|looksmax|manosphere|internet|slang|term|coined|refers to|used)\b/i
const WIKIPEDIA_USAGE_SIGNALS = /\b(slang|colloquial(?:ly|ism)?|internet memes?)\b/i

function hasIncelsUsageEvidence(text: string): boolean {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length >= MIN_SIGNIFICANT_INCELS_CHARS && INCELS_USAGE_SIGNALS.test(compact)
}

function getSupplementalSourceSignals(researchContext: ResearchContext): SupplementalSourceSignals {
  const sources = mainSourceRecords(researchContext.mainWord)
  const textFor = (provider: 'incelsWiki' | 'wikipedia') =>
    sources
      .filter((source) => source.provider === provider)
      .map((source) => source.data.text)
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim()
  const incelsText = textFor('incelsWiki')
  const wikipediaText = textFor('wikipedia')

  const incelsWiki = hasIncelsUsageEvidence(incelsText)
  const wikipedia =
    wikipediaText.length >= MIN_SIGNIFICANT_WIKIPEDIA_CHARS &&
    WIKIPEDIA_USAGE_SIGNALS.test(wikipediaText)

  return { incelsWiki, wikipedia }
}

function sanitizeModernUsage(result: EtymologyResult, researchContext: ResearchContext): void {
  const modernUsage = result.modernUsage
  if (!modernUsage) return

  if (!modernUsage.hasSlangMeaning) {
    result.modernUsage = { hasSlangMeaning: false }
    return
  }

  // Research for other languages deliberately excludes slang-only English sources.
  if (result.language !== 'en') {
    result.modernUsage = { hasSlangMeaning: false }
    return
  }

  const supplementalSignals = getSupplementalSourceSignals(researchContext)
  const hasSupplementalSlangEvidence =
    supplementalSignals.incelsWiki || supplementalSignals.wikipedia
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

interface SynthesisOptions {
  model?: string
  signal?: AbortSignal
  /**
   * Selects streaming transport and publishes validated entry fields once.
   * Source-defined primary-history fields can arrive before the complete
   * histories array; collection metadata waits for the full identity check.
   * Malformed streaming output is not retried within the transport because
   * sections already on the wire cannot be retracted.
   */
  onSection?: (section: string, data: unknown) => void
}

type LlmCallOptions = SynthesisOptions & {
  language: LanguageCode
  onHistory?: (history: unknown) => void
}

async function callLlm(
  userPrompt: string,
  options: LlmCallOptions
): Promise<{
  text: string
  usage: LlmUsage
}> {
  const request = buildSynthesisRequest(userPrompt, options.model)
  request.instructions = buildSystemPrompt(options.language)
  const onSection = options.onSection

  try {
    if (!onSection) {
      const response = await createOpenRouterResponse(request, CONFIG.timeouts.llm, options.signal)
      return { text: extractOutputText(response), usage: extractUsage(response) }
    }

    const onHistory = options.onHistory
    const scanner = createSectionScanner(
      (section, data) => onSection(section, stripNullsDeep(data)),
      onHistory
        ? (section, _index, data) => {
            if (section === 'histories') onHistory(stripNullsDeep(data))
          }
        : undefined
    )

    let streamedText = ''
    const response = await streamOpenRouterResponse(
      request,
      (token) => {
        streamedText += token
        scanner.push(token)
      },
      CONFIG.timeouts.llm,
      options.signal
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
    if (options.signal?.aborted) {
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
  options: LlmCallOptions,
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
    malformedAttemptLimit ?? (options.onSection ? 1 : CONFIG.retries.malformedOutputRetries + 1)
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

export function isRecoverableValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith('Schema validation failed:') &&
    !isAbortLikeError(error)
  )
}

function attachSources(result: EtymologyResult, researchContext: ResearchContext): EtymologyResult {
  const sources: SourceReference[] = []
  const seen = new Set<string>()
  const lookups = [
    { word: researchContext.mainWord.word, records: mainSourceRecords(researchContext.mainWord) },
    ...researchContext.rootResearch.map((root) => ({
      word: root.lexeme?.word ?? root.root,
      records: rootSourceRecords(root),
    })),
    ...researchContext.relatedResearch.map((related) => ({
      word: related.lexeme?.word ?? related.term,
      records: relatedSourceRecords(related),
    })),
  ]
  for (const { word, records } of lookups) {
    for (const record of records) {
      if (record.provider === 'incelsWiki' && !hasIncelsUsageEvidence(record.data.text)) continue
      // A portal can host several independent dictionaries at the same URL.
      // Conversely, direct and recovered copies of one publisher are one source.
      const urls = new Set([
        record.data.url,
        ...(record.data.entryGroups ?? []).flatMap((group) =>
          group.sourceUrl ? [group.sourceUrl] : []
        ),
      ])
      for (const url of urls) {
        const key = `${record.provider}:${url}`
        if (seen.has(key)) continue
        seen.add(key)
        sources.push({
          name: record.provider,
          url,
          word,
          sourceFamily: record.sourceFamily,
          ...(record.data.license ? { license: record.data.license } : {}),
          ...(record.provider === 'multilingualDictionary'
            ? { license: 'Per-entry attribution and license are provided by FreeDictionaryAPI' }
            : {}),
        })
      }
    }
  }
  result.sources = sources.length ? sources : [{ name: 'synthesized' }]
  return result
}

function sameStrings(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const sortedRight = [...right].sort()
  return [...left].sort().every((value, index) => value === sortedRight[index])
}

function sameLexeme(form: string, language: string, lexeme: LexemeRef): boolean {
  return (
    sameSpelling(form, lexeme.word) &&
    lexicalLanguageName(language) === lexicalLanguageName(lexeme.language)
  )
}

function sourceStrata(
  entry: ResearchEntryContext,
  chains: ParsedEtymChain[]
): Set<EtymologyStratum> {
  const supported = new Set<EtymologyStratum>()
  const affirmative = (entry.etymologyText ?? '')
    .split(/\n|(?<=[.!?])\s+/u)
    .filter(
      (sentence) =>
        !/\b(?:although|not|never|mistaken|incorrect|disputed|described as|rather than)\b/i.test(
          sentence
        )
    )
    .join('\n')
  if (/\bwasei[ -]kango\b/i.test(affirmative)) supported.add('wasei-kango')
  if (
    /\bwasei[ -]eigo\b|\bpseudo-anglicism\b/i.test(affirmative) ||
    (entry.source === 'jmdict' &&
      /Wasei, word made in Japan/.test(entry.text) &&
      /"language":"English"/.test(entry.text))
  )
    supported.add('wasei-eigo')
  if (
    /(?:^|\n)(?:(?:The (?:word|term) is|A|An) )?(?:wago|native Japanese)\b/i.test(affirmative) ||
    /\b(?:from|inherited from) (?:Old Japanese|Classical Japanese|Proto-Japonic)\b/i.test(
      affirmative
    )
  )
    supported.add('wago')
  if (
    !supported.has('wasei-kango') &&
    /\bkango\b|\bSino-Japanese\b|\bfrom (?:Middle|Old) Chinese\b/i.test(affirmative)
  )
    supported.add('kango')
  if (/(?:^|\n)(?:(?:The (?:word|term) is|A|An) )?hybrid\b/i.test(affirmative))
    supported.add('hybrid')
  if (
    /\bgairaigo\b/i.test(affirmative) ||
    chains.some(
      (chain) =>
        chain.evidenceScopeId === entry.evidenceScopeId &&
        !chain.subject &&
        chain.links.some(
          (link) =>
            !/Japanese|Japonic|Chinese/i.test(link.language) &&
            /\b(?:borrowed )?from\s+(?:the\s+)?/i.test(link.rawSnippet) &&
            affirmative.includes(link.rawSnippet)
        )
    )
  )
    supported.add('gairaigo')
  return supported
}

function branchContains(branch: AncestryBranch, lexeme: LexemeRef): boolean {
  return branch.stages.some((stage) => sameLexeme(stage.form, stage.stage, lexeme))
}

function validateContinuationOrder(branch: AncestryBranch, chain: ParsedEtymChain): void {
  if (!chain.subject) return
  let younger = branch.stages.findIndex((stage) =>
    sameLexeme(stage.form, stage.stage, chain.subject!)
  )
  if (younger < 0) return
  for (const link of chain.links) {
    const position = branch.stages.findIndex((stage) =>
      sameLexeme(stage.form, stage.stage, { word: link.form, language: link.language })
    )
    if (position < 0) continue
    if (position >= younger)
      throw new Error('Schema validation failed: continuation ancestry must occur before its donor')
    younger = position
  }
}

function clippingPath(
  query: LexemeRef,
  merge: LexemeRef,
  entry: ResearchEntryContext,
  chains: ParsedEtymChain[],
  visited = new Set<string>()
): LexemeRef[] | undefined {
  if (sameLexeme(query.word, query.language, merge)) return [query]
  const key = `${query.language}:${canonicalizeWord(query.word)}`
  if (visited.has(key)) return
  const nextVisited = new Set([...visited, key])
  const targets = chains
    .filter(
      (chain) => chain.subject && sameLexeme(chain.subject.word, chain.subject.language, query)
    )
    .flatMap((chain) =>
      chain.links
        .filter((link) => link.relation === 'derived_from')
        .map((link) => ({ word: link.form, language: link.language }))
    )
  if (entry.formOf && sameSpelling(query.word, entry.formOf.word) === false && visited.size === 0)
    targets.push(entry.formOf)
  for (const target of targets) {
    if (lexicalLanguageName(target.language) !== lexicalLanguageName(query.language)) continue
    const tail = clippingPath(target, merge, entry, chains, nextVisited)
    if (tail) return [query, ...tail]
  }
}

/** Evidence follows its attested component or donor, rather than the entire history's scope union. */
function enrichScopedHistory(
  history: LexicalHistory,
  entry: ResearchEntryContext,
  context: ResearchContext,
  chains: ParsedEtymChain[],
  sourceWasei: boolean
): void {
  const graph = history.ancestryGraph
  const query = {
    word: context.mainWord.word,
    language: LANGUAGES[context.language ?? 'en'].englishName,
  }
  const compounds = chains.filter(
    (chain) => chain.subject && chain.links.some((link) => link.relation === 'compound_from')
  )
  const wholeAccount = chains.some(
    (chain) =>
      (!chain.subject ||
        sameLexeme(chain.subject.word, chain.subject.language, query) ||
        (entry.formOf && sameLexeme(chain.subject.word, chain.subject.language, entry.formOf))) &&
      chain.links.some(
        (link) =>
          link.relation !== 'compound_from' &&
          !compounds.some(
            (compound) =>
              sameLexeme(link.form, link.language, compound.subject!) ||
              compound.links.some((component) =>
                sameLexeme(link.form, link.language, {
                  word: component.form,
                  language: component.language,
                })
              )
          )
      )
  )
  if (compounds.length && !wholeAccount && graph.branches.length && !graph.mergePoint)
    throw new Error('Schema validation failed: source compound requires its attested merge')
  if (compounds.length && (graph.mergePoint || graph.branches.length > 1)) {
    const merging = compounds.filter(
      (chain) =>
        graph.mergePoint &&
        sameSpelling(chain.subject!.word, graph.mergePoint.form) &&
        lexicalLanguageName(chain.subject!.language) === query.language
    )
    const targets = merging.flatMap((chain) =>
      chain.links.filter((link) => link.relation === 'compound_from')
    )
    if (targets.length < 2 || graph.branches.length < 2)
      throw new Error('Schema validation failed: compound merge lacks its source-attested identity')
    const used = new Set<string>()
    for (const branch of graph.branches) {
      const terminal = branch.stages.at(-1)
      const target =
        terminal &&
        targets.find((link) =>
          sameLexeme(terminal.form, terminal.stage, { word: link.form, language: link.language })
        )
      if (!target)
        throw new Error('Schema validation failed: ancestry branch is not an attested component')
      const key = `${target.language}:${canonicalizeWord(target.form)}`
      if (used.has(key)) throw new Error('Schema validation failed: duplicated source component')
      used.add(key)
      const evidence = chains.filter((chain) =>
        merging.includes(chain)
          ? chain.links.some((link) => link === target)
          : chain.subject &&
            branchContains(branch, chain.subject) &&
            chain.evidenceScopeId !== entry.evidenceScopeId
      )
      evidence
        .filter((chain) => !merging.includes(chain))
        .forEach((chain) => validateContinuationOrder(branch, chain))
      enrichAncestryGraph({ branches: [branch] }, evidence)
      if (branch.stages.some((stage) => stage.confidence === 'low'))
        throw new Error('Schema validation failed: component branch has unsupported ancestry')
    }
    // A merge has no stage language field. Its source relationship establishes
    // query-language identity; only its explicit clipping/form path may follow it.
    const postForms = clippingPath(query, merging[0].subject!, entry, chains)
    if (!postForms)
      throw new Error(
        'Schema validation failed: compound merge has no source-attested path to the query'
      )
    for (const stage of graph.postMerge ?? []) {
      if (!postForms.some((lexeme) => sameLexeme(stage.form, stage.stage, lexeme)))
        throw new Error('Schema validation failed: post-merge ancestry is not source-attested')
    }
    enrichAncestryGraph(
      { branches: [], postMerge: graph.postMerge },
      chains.filter(
        (chain) => !chain.subject || sameLexeme(chain.subject.word, chain.subject.language, query)
      )
    )
  } else {
    if (
      sourceWasei &&
      [...graph.branches.flatMap((branch) => branch.stages), ...(graph.postMerge ?? [])].some(
        (stage) => lexicalLanguageName(stage.stage) === 'English'
      )
    )
      throw new Error(
        'Schema validation failed: Japanese coinage cannot have a whole-word English ancestor'
      )
    for (const branch of graph.branches) {
      const evidence = chains.filter(
        (chain) =>
          !chain.subject ||
          sameLexeme(chain.subject.word, chain.subject.language, query) ||
          (entry.formOf && sameLexeme(chain.subject.word, chain.subject.language, entry.formOf)) ||
          branchContains(branch, chain.subject)
      )
      evidence
        .filter((chain) => chain.evidenceScopeId !== entry.evidenceScopeId)
        .forEach((chain) => validateContinuationOrder(branch, chain))
      enrichAncestryGraph(
        { branches: [branch] },
        evidence.filter((chain) => !chain.links.some((link) => link.relation === 'compound_from'))
      )
      const wholeLinks = evidence
        .filter((chain) => !chain.links.some((link) => link.relation === 'compound_from'))
        .flatMap((chain) => chain.links)
      for (const stage of branch.stages) {
        const component = compounds.some((chain) =>
          chain.links.some((link) =>
            sameLexeme(stage.form, stage.stage, { word: link.form, language: link.language })
          )
        )
        if (
          component &&
          !wholeLinks.some((link) =>
            sameLexeme(stage.form, stage.stage, { word: link.form, language: link.language })
          )
        )
          throw new Error(
            'Schema validation failed: component evidence cannot establish whole-word ancestry'
          )
      }
    }
    enrichAncestryGraph(
      { branches: [], postMerge: graph.postMerge },
      chains.filter((chain) => !chain.subject)
    )
  }
}

/** Reject cross-history topology before any evidence-bearing section is published. */
function validateHistoryGraph(history: LexicalHistory, context: ResearchContext): void {
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
      .flatMap((root) =>
        lexicalSourceRecords(rootSourceRecords(root)).map((source) => source.data.text)
      )
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

function finalizeHistories(result: EtymologyResult, researchContext: ResearchContext): void {
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
    const entry = researchContext.entryContexts?.find((entry) => entry.id === history.id)
    const source = entry?.source
    if (entry?.transliteration) history.transliteration = entry.transliteration
    else delete history.transliteration
    const counterparts = normalizeScriptTargets(entry?.counterparts)
    if (counterparts.length) history.counterparts = counterparts
    else delete history.counterparts
    const sourceRecord = mainSourceRecords(researchContext.mainWord).find(
      (record) => record.provider === source
    )
    const cannotEstablishAncestry =
      source === 'multilingualDictionary' ||
      source === 'wikipedia' ||
      (sourceRecord && sourceEvidenceRole(sourceRecord) !== 'etymology')
    if (
      cannotEstablishAncestry &&
      (history.roots.length ||
        history.ancestryGraph.branches.length ||
        history.ancestryGraph.mergePoint ||
        history.ancestryGraph.postMerge?.length ||
        history.ancestryGraph.convergencePoints?.length)
    ) {
      throw new Error(
        source === 'multilingualDictionary'
          ? 'Schema validation failed: dictionary fallback cannot establish ancestry'
          : 'Schema validation failed: contextual or senses-only source cannot establish ancestry'
      )
    }
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

    validateHistoryGraph(history, researchContext)
    const scopedChains = (researchContext.parsedChains ?? []).filter(
      (chain) =>
        chain.historyId === history.id &&
        Boolean(chain.evidenceScopeId) &&
        history.evidenceScopeIds.includes(chain.evidenceScopeId as string)
    )
    const strata =
      researchContext.language === 'ja' && entry
        ? sourceStrata(entry, scopedChains)
        : new Set<EtymologyStratum>()
    if (history.stratum && !strata.has(history.stratum)) {
      console.warn(
        '[LLM] Cleared unsupported lexical stratum',
        JSON.stringify({ historyId: history.id, stratum: history.stratum })
      )
      delete history.stratum
    }
    enrichScopedHistory(history, entry!, researchContext, scopedChains, strata.has('wasei-eigo'))
    pruneUngroundedStages(history.ancestryGraph)
    // Distinct unsupported roots can collapse into identical surviving paths.
    validateHistoryGraph(history, researchContext)
  }

  const primary = result.histories.find((history) => history.id === result.primaryHistoryId)
  if (!primary) {
    throw new Error('Schema validation failed: primary history is missing')
  }
  if (primary.transliteration) result.transliteration = primary.transliteration
  else delete result.transliteration
  if (primary.counterparts) result.counterparts = primary.counterparts
  else delete result.counterparts
  if (primary.stratum) result.stratum = primary.stratum
  else delete result.stratum
  result.pronunciation = primary.pronunciation
  result.definition = primary.definition
  result.roots = primary.roots
  result.ancestryGraph = primary.ancestryGraph
  result.lore = primary.lore
  result.examples = primary.examples
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
  if (result.language !== (researchContext.language ?? 'en')) {
    throw new Error('Schema validation failed: synthesis changed requested language')
  }
  sanitizeModernUsage(result, researchContext)
  finalizeHistories(result, researchContext)
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
  researchContext: ResearchContext,
  options?: SynthesisOptions
): Promise<SynthesisResult> {
  const language = researchContext.language ?? 'en'
  const userPrompt = buildUserPrompt(
    researchContext.mainWord.word,
    language,
    buildResearchPrompt(researchContext)
  )

  const totalUsage: LlmUsage = { inputTokens: 0, outputTokens: 0 }
  // A post-processing validation failure retries once, as a unary call: the
  // streamed sections of the first attempt cannot be retracted, so the retry
  // only replaces them through the terminal result.
  const maxValidationAttempts = 2

  for (let attempt = 0; attempt < maxValidationAttempts; attempt += 1) {
    try {
      const pendingSections = new Map<string, unknown>()
      const publishedSections = new Set<string>()
      let wordVerified = false
      let languageVerified = false
      let identityError: Error | undefined
      let pendingPrimaryHistory: unknown
      const entryFields = [
        'stratum',
        'pronunciation',
        'transliteration',
        'counterparts',
        'definition',
        'ancestryGraph',
        'roots',
        'lore',
        'examples',
        'partsOfSpeech',
      ]
      const publish = (name: string, value: unknown) => {
        if (publishedSections.has(name)) return
        publishedSections.add(name)
        if (value !== undefined) options?.onSection?.(name, value)
      }
      const publishEntry = (entry: EtymologyResult) => {
        for (const name of entryFields)
          publish(name, (entry as unknown as Record<string, unknown>)[name])
      }
      const publishPrimary = () => {
        const graph = researchContext.lexicalGraph
        if (
          identityError ||
          !wordVerified ||
          !languageVerified ||
          !pendingPrimaryHistory ||
          publishedSections.has('definition') ||
          !graph?.histories.length ||
          pendingSections.get('primaryHistoryId') !== graph.histories[0].id
        )
          return
        try {
          // Only the expected history set narrows for this partial projection.
          // Keep all source contexts and chains so foreign-history ancestry is
          // rejected exactly as it is in the complete collection finalizer.
          const primary = finalizeResult(
            {
              word: researchContext.mainWord.word,
              language,
              primaryHistoryId: pendingSections.get('primaryHistoryId'),
              histories: [pendingPrimaryHistory],
              sources: [],
            } as unknown as EtymologyResult,
            {
              ...researchContext,
              lexicalGraph: { ...graph, histories: graph.histories.slice(0, 1) },
            },
            'streaming'
          )
          publishEntry(primary)
        } catch (error) {
          // Preserve completed provider usage even when an early history fails.
          identityError = error instanceof Error ? error : new Error(String(error))
        }
      }
      const onHistory = options?.onSection
        ? (history: unknown) => {
            if (
              history &&
              typeof history === 'object' &&
              'id' in history &&
              history.id === researchContext.lexicalGraph?.histories[0]?.id
            ) {
              pendingPrimaryHistory = history
              publishPrimary()
            }
          }
        : undefined
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
            if (!wordVerified || !languageVerified) return
            publish('language', language)
            publish('word', researchContext.mainWord.word)
            publishPrimary()
            if (identityError) return
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
                for (const name of ['primaryHistoryId', 'histories']) {
                  publish(name, (primary as unknown as Record<string, unknown>)[name])
                }
                publishEntry(primary)
              } catch (error) {
                // Drain the provider response even on validation failure so
                // its completed usage is included in the failed request.
                identityError = error instanceof Error ? error : new Error(String(error))
              }
            }
          }
        : undefined
      const attemptOptions =
        attempt === 0
          ? { ...options, language, onSection, onHistory }
          : { model: options?.model, signal: options?.signal, language }
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

      if (attempt < maxValidationAttempts - 1 && isRecoverableValidationError(error)) {
        console.warn(
          '[LLM] Retrying synthesis after validation failure',
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

  throw new Error('Synthesis exhausted its validation attempts')
}
