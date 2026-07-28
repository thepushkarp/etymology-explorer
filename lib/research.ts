/**
 * Agentic research module for deep etymology exploration.
 * Conducts multi-source lookups to gather rich context about word origins
 * and constituent roots.
 */

import { fetchEtymonline } from './etymonline'
import { fetchWiktionary } from './wiktionary'
import { fetchWikipedia } from './wikipedia'
import { fetchUrbanDictionary } from './urbanDictionary'
import { fetchIncelsWiki } from './incelsWiki'
import { fetchFreeDictionary, compactFreeDictionary } from './freeDictionary'
import {
  LlmUsage,
  RelatedTermResearchData,
  ResearchContext,
  RootResearchData,
  StreamEvent,
} from './types'
import {
  parseSourceTexts,
  formatParsedChainsForPrompt,
  type ParsedEtymChain,
} from './etymologyParser'
import { CONFIG } from './config'
import { safeError } from './errorUtils'
import {
  buildRootExtractionRequest,
  createOpenRouterResponse,
  extractOutputText,
  extractUsage,
} from './openrouterResponses'
import { isBetaLanguage, type LanguageCode } from './languages'
import {
  fetchDicionarioAberto,
  fetchEnglishWiktionaryLanguage,
  fetchFreeDictionaryApi,
  fetchNativeWiktionary,
  fetchWikidataLexeme,
} from './multilingualSources'

export interface RootExtraction {
  roots: string[]
  usage: LlmUsage | null // null when no LLM call was made (or it failed before billing)
}

/**
 * Decide whether the main-word bundle has enough independent evidence to
 * justify synthesis. Curated dictionary/encyclopedia hits can confirm a real
 * word when the two etymology-specific sources miss or are temporarily down;
 * community-only sources are not sufficient on their own.
 */
export function hasCredibleMainSource(context: ResearchContext): boolean {
  const { mainWord } = context
  if (context.language && context.language !== 'en') {
    // A same-spelling entry elsewhere is never enough: one selected-language
    // Wiktionary edition must confirm that this lexeme exists.
    return Boolean(mainWord.wiktionaryEnglish || mainWord.wiktionaryNative)
  }
  return Boolean(
    mainWord.etymonline || mainWord.wiktionary || mainWord.freeDictionary || mainWord.wikipedia
  )
}

async function conductBetaResearch(
  word: string,
  language: Exclude<LanguageCode, 'en'>,
  signal: AbortSignal | undefined,
  onProgress: ((event: StreamEvent) => void) | undefined
): Promise<ResearchContext> {
  const sources = [
    ['wiktionaryEnglish', () => fetchEnglishWiktionaryLanguage(word, language, signal)],
    ['wiktionaryNative', () => fetchNativeWiktionary(word, language, signal)],
    ['multilingualDictionary', () => fetchFreeDictionaryApi(word, language, signal)],
    ['wikidataLexeme', () => fetchWikidataLexeme(word, language, signal)],
    ...(language === 'pt'
      ? ([['dicionarioAberto', () => fetchDicionarioAberto(word, signal)]] as const)
      : []),
  ] as const

  const startedAt = Date.now()
  for (const [name] of sources) emitProgress(onProgress, { type: 'source_started', source: name })
  const results = await Promise.all(
    sources.map(async ([name, fetcher]) => {
      try {
        const data = await fetcher()
        emitProgress(onProgress, {
          type: 'source_complete',
          source: name,
          timing: Date.now() - startedAt,
          preview: data?.text.slice(0, 100),
        })
        return data
      } catch (error) {
        emitProgress(onProgress, { type: 'source_failed', source: name, error: safeError(error) })
        return null
      }
    })
  )
  signal?.throwIfAborted()

  const byName = Object.fromEntries(sources.map(([name], index) => [name, results[index]]))
  const wiktionaryEnglish = byName.wiktionaryEnglish ?? null
  const wiktionaryNative = byName.wiktionaryNative ?? null
  const parsedChains = parseSourceTexts(
    word,
    null,
    [wiktionaryEnglish?.text, wiktionaryNative?.text].filter(Boolean).join('\n\n')
  )
  const identifiedRootLexemes = parsedChains
    .flatMap((chain) => chain.links)
    .filter((link) => link.form.toLocaleLowerCase() !== word.toLocaleLowerCase())
    .slice(0, CONFIG.maxRootsToExplore)
    .map((link) => ({ word: link.form, language: link.language }))

  emitProgress(onProgress, {
    type: 'parsing_complete',
    chainCount: parsedChains.length,
  })
  emitProgress(onProgress, {
    type: 'roots_identified',
    roots: identifiedRootLexemes.map((lexeme) => lexeme.word),
  })

  return {
    language,
    mainWord: {
      word,
      etymonline: null,
      wiktionary: null,
      wiktionaryEnglish,
      wiktionaryNative,
      multilingualDictionary: byName.multilingualDictionary ?? null,
      wikidataLexeme: byName.wikidataLexeme ?? null,
      dicionarioAberto: byName.dicionarioAberto ?? null,
    },
    identifiedRoots: identifiedRootLexemes.map((lexeme) => lexeme.word),
    identifiedRootLexemes,
    rootResearch: [],
    relatedResearch: [],
    parsedChains,
    // Wikidata uses search + entity-detail requests; all beta research stays
    // well below the shared 16-fetch ceiling (5 normally, 6 for Portuguese).
    totalSourcesFetched: sources.length + (byName.wikidataLexeme ? 1 : 0),
  }
}

export async function extractRootsQuick(
  word: string,
  etymonlineText: string | null,
  wiktionaryText: string | null,
  signal?: AbortSignal
): Promise<RootExtraction> {
  // A 100-token extraction doesn't need the full source pages, but long
  // entries can put compounds or cognates near the tail. Use the same
  // head+tail clipping strategy as synthesis so the fallback does not
  // silently lose late derivation clues.
  const maxChars = CONFIG.promptBudget.rootExtractionSourceChars
  const sourceText = [etymonlineText, wiktionaryText]
    .filter((text): text is string => Boolean(text))
    .map((text) => sanitizeSourceText(text, maxChars))
    .join('\n\n')

  if (!sourceText) {
    return { roots: [], usage: null }
  }

  const prompt = `Analyze this etymology data and extract the ETYMOLOGICAL root morphemes of the word "${word}".

Rules:
- Extract roots that carry independent meaning and have their own etymology worth researching.
- Include prefixes only when they are productive and meaningfully change the word (for example, "contra-" in "contradict").
- Exclude inflectional or low-signal suffixes such as -ed, -ing, -ly, -tion, -ible, and -ous unless the source data makes them etymologically central.
- For single-morpheme words with no compound structure, return just the word itself.

Source data:
${sourceText}

Return ONLY a JSON object with a "roots" array of root strings (the actual morphemes, not full words).
Examples:
- For "telephone": ["tele", "phone"]
- For "autobiography": ["auto", "bio", "graph"]
- For "incredible": ["cred"]
- For "contradict": ["contra", "dict"]
- For "cat": ["cat"]

Return the JSON object only, no explanation:`

  let response
  try {
    const request = buildRootExtractionRequest(prompt)
    request.instructions =
      'Extract root morphemes only. Return {"roots":["root"]} with lowercase strings and no commentary.'

    response = await createOpenRouterResponse(request, CONFIG.timeouts.rootExtraction, signal)
  } catch (error) {
    if (signal?.aborted) throw error
    console.error('Root extraction error:', safeError(error))
    return { roots: [], usage: null }
  }

  // The call was billed even if the output is unusable — always report usage.
  const usage = extractUsage(response)
  try {
    return { roots: parseRootsArray(extractOutputText(response)), usage }
  } catch (error) {
    console.error('Root extraction error:', safeError(error))
    return { roots: [], usage }
  }
}

/**
 * Parse a JSON array of roots from LLM response
 */
function parseRootsArray(text: string): string[] {
  const normalizeRoots = (parsed: unknown): string[] => {
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as { roots?: unknown }).roots)
    ) {
      return normalizeRoots((parsed as { roots: unknown[] }).roots)
    }

    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((s) => s.toLowerCase().trim())
      .slice(0, CONFIG.maxRootsToExplore)
  }

  try {
    return normalizeRoots(JSON.parse(text))
  } catch {
    const jsonMatch = text.match(/\[[\s\S]*?\]/)
    if (!jsonMatch) return []

    try {
      return normalizeRoots(JSON.parse(jsonMatch[0]))
    } catch {
      return []
    }
  }
}

const TERM_PATTERN = /[\p{L}*][\p{L}*'’.-]*/gu
const LOW_SIGNAL_TERMS = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'word',
  'latin',
  'greek',
  'english',
  'french',
  'german',
  'middle',
  'old',
  'ancient',
  'proto',
  'indo-european',
])

/**
 * Inflectional suffixes and formula noise words that are not worth a
 * dedicated root-research fetch (mirrors the LLM extraction prompt rules).
 * The last row catches structural words that leak out of derivation
 * formulas like "from ne 'not' + stem of scire".
 */
const LOW_SIGNAL_AFFIXES = new Set([
  's',
  'es',
  'ed',
  'en',
  'ing',
  'ly',
  'er',
  'est',
  'y',
  'ie',
  'ness',
  'ment',
  'tion',
  'sion',
  'ible',
  'able',
  'ous',
  'al',
  'ish',
  'ity',
  'root',
  'stem',
  'word',
  'form',
  'prefix',
  'suffix',
])

/**
 * Matches explicit derivation formulas in source text, e.g.
 *   "From doom +\u200E scrolling"
 *   "equivalent to in- +\u200E credible"
 *   "By surface analysis, tele- +\u200E -phone"
 *   "derived from tele- (prefix meaning 'from a distance') +\u200E -phone"
 *   'from télé- "far" (see tele- ) + phōnē "sound, voice"'
 * Each morpheme may carry parenthetical or quoted gloss annotations before
 * the "+". Wiktionary inserts U+200E LEFT-TO-RIGHT MARK after "+" — strip
 * it before matching (the callers do this via extractDerivationParts).
 */
const FORMULA_ANNOTATION = /\([^)]*\)|"[^"]*"|“[^”]*”/
const DERIVATION_FORMULA_PATTERN = new RegExp(
  String.raw`\b(?:from|equivalent to|modelled after|modeled after|surface analysis[,:]?|compound of)` +
    String.raw`\s+((?:[\p{L}*'’.-]+(?:\s*(?:${FORMULA_ANNOTATION.source}))*\s*\+\s*)+[\p{L}*'’.-]+)`,
  'giu'
)

/**
 * Extract the individual morphemes of every "X + Y (+ Z)" derivation formula
 * in the text, stripping gloss annotations. Returns raw parts — callers
 * normalize/filter them.
 */
function extractDerivationParts(text: string): string[] {
  const cleaned = text.replace(/[\u200E\u200F]/g, '')
  const annotations = new RegExp(FORMULA_ANNOTATION.source, 'gu')
  const parts: string[] = []
  for (const match of cleaned.matchAll(DERIVATION_FORMULA_PATTERN)) {
    for (const part of match[1].split(/\s*\+\s*/)) {
      const bare = part.replace(annotations, ' ').trim()
      if (bare) parts.push(bare)
    }
  }
  return parts
}

/**
 * Normalize a raw CPU root candidate: trim affix hyphens and punctuation,
 * fold diacritics (télé/phōnē → tele/phone, matching source page titles),
 * lowercase, and reject reconstructed forms, the word itself, and
 * inflectional suffixes. Returns null when the candidate is not researchable.
 */
function normalizeRootCandidate(term: string, word: string): string | null {
  const normalized = term
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200E\u200F]/g, '')
    .replace(/^[-.,;:'’]+/, '')
    .replace(/[-.,;:'’]+$/, '')
    .trim()

  if (!normalized || normalized.includes('*')) return null
  if (/\s/.test(normalized)) return null
  if (normalized.length < 2) return null
  if (normalized === word) return null
  if (LOW_SIGNAL_AFFIXES.has(normalized)) return null
  return normalized
}

/**
 * CPU-only root extraction: derivation formulas ("From X + Y",
 * "equivalent to X + Y") plus hyphen-marked affix morphemes from the
 * pre-parsed chains. When this finds at least one root, the LLM
 * extraction call is skipped entirely.
 */
export function extractRootsCpu(
  word: string,
  etymonlineText: string | null,
  wiktionaryText: string | null,
  parsedChains: ParsedEtymChain[]
): string[] {
  const normalizedWord = word.toLowerCase().trim()
  const combinedText = [etymonlineText, wiktionaryText].filter(Boolean).join('\n')
  const candidates = extractDerivationParts(combinedText)

  for (const chain of parsedChains) {
    for (const link of chain.links) {
      if (link.isReconstructed) continue
      const form = link.form.replace(/[\u200E\u200F]/g, '')
      // Affix notation ("tele-", "-phone") marks a morpheme worth researching
      if (/^-\p{L}/u.test(form) || /\p{L}-$/u.test(form)) {
        candidates.push(form)
      }
    }
  }

  const roots: string[] = []
  for (const candidate of candidates) {
    const normalized = normalizeRootCandidate(candidate, normalizedWord)
    if (normalized && !roots.includes(normalized)) {
      roots.push(normalized)
    }
  }

  return roots.slice(0, CONFIG.maxRootsToExplore)
}

function normalizeCandidateTerm(term: string): string | null {
  const normalized = term
    .toLowerCase()
    .trim()
    .replace(/[.,;:()]+$/g, '')
  if (!normalized) return null
  if (LOW_SIGNAL_TERMS.has(normalized)) return null
  if (normalized.length < 3 && !normalized.startsWith('*')) return null
  return normalized
}

/**
 * Extract related terms mentioned in source text
 */
export function extractRelatedTerms(
  text: string,
  excludeWords: string[],
  seedTerms: string[] = []
): string[] {
  const patterns = [
    /related to ([\p{L}*'’.-]+)/giu,
    /cognate with ([\p{L}*'’.-]+)/giu,
    /see also ([\p{L}*'’.-]+)/giu,
    /compare ([\p{L}*'’.-]+)/giu,
    /akin to ([\p{L}*'’.-]+)/giu,
    /ultimately (?:derived )?from [^.\n;:]*?([\p{L}*'’.-]+)/giu,
    /borrowed from [^.\n;:]*?([\p{L}*'’.-]+)/giu,
    /derived from [^.\n;:]*?([\p{L}*'’.-]+)/giu,
    /inherited from [^.\n;:]*?([\p{L}*'’.-]+)/giu,
    /from (\w+) ["']([\p{L}*'’.-]+)["']/giu,
  ]

  const scores = new Map<string, number>()
  const excludeLower = new Set(excludeWords.map((word) => word.toLowerCase()))

  const addCandidate = (term: string, score: number) => {
    const normalized = normalizeCandidateTerm(term)
    if (!normalized || excludeLower.has(normalized)) return
    scores.set(normalized, (scores.get(normalized) ?? 0) + score)
  }

  for (const term of seedTerms) {
    addCandidate(term, 5)
  }

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      for (const candidate of match.slice(1).filter(Boolean)) {
        for (const token of candidate.match(TERM_PATTERN) ?? []) {
          addCandidate(token, 3)
        }
      }
    }
  }

  // Derivation formulas ("From X + Y", "equivalent to X + Y") are high-signal
  for (const part of extractDerivationParts(text)) {
    const trimmed = part.replace(/^-+|-+$/g, '')
    if (LOW_SIGNAL_AFFIXES.has(trimmed.toLowerCase())) continue
    addCandidate(trimmed, 4)
  }

  for (const match of text.matchAll(/\*[\p{L}\d₀-₉ʰʷʸ'-]+/gu)) {
    addCandidate(match[0], 4)
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([term]) => term)
    .slice(0, CONFIG.maxRelatedWordsPerRoot)
}

/**
 * Fetch research data for a single root
 */
async function fetchRootResearch(root: string, signal?: AbortSignal): Promise<RootResearchData> {
  const [etymonlineData, wiktionaryData] = await Promise.all([
    fetchEtymonline(root, signal),
    fetchWiktionary(root, signal),
  ])

  const combinedText = [etymonlineData?.text, wiktionaryData?.text].filter(Boolean).join(' ')
  const relatedTerms = extractRelatedTerms(
    combinedText,
    [root],
    etymonlineData?.relatedEntries ?? []
  )

  return {
    root,
    etymonlineData,
    wiktionaryData,
    relatedTerms,
  }
}

/**
 * Related terms are peripheral evidence (cousin words for lore), so a single
 * etymonline page per term is enough — the main word's chains carry the
 * grounding. One fetch per term instead of two also frees wave budget.
 */
async function fetchRelatedTermResearch(
  term: string,
  signal?: AbortSignal
): Promise<RelatedTermResearchData> {
  const etymonlineData = await fetchEtymonline(term, signal)

  return {
    term,
    etymonlineData,
  }
}

/**
 * Emit a progress event safely (non-blocking)
 */
function emitProgress(callback: ((event: StreamEvent) => void) | undefined, event: StreamEvent) {
  if (!callback) return
  try {
    callback(event)
  } catch (error) {
    console.error('[Research] Progress callback error:', safeError(error))
  }
}

/**
 * Conduct agentic research to gather rich etymology context.
 * This is the main orchestrator that:
 * 1. Fires all source fetches in parallel; only etymonline + wiktionary gate
 *    the next phase, the remaining sources join before this returns
 * 2. Identifies roots on-CPU from derivation formulas / parsed chains,
 *    falling back to a quick LLM call
 * 3. Fetches root pages and related-term pages in one parallel wave
 *
 * An aborted `options.signal` (e.g. client disconnect) cancels in-flight
 * fetches and stops the pipeline at the next phase boundary.
 */
export async function conductAgenticResearch(
  word: string,
  options?: { skipOptionalSources?: boolean; signal?: AbortSignal; language?: LanguageCode },
  onProgress?: (event: StreamEvent) => void
): Promise<ResearchContext> {
  let totalFetches = 0
  const normalizedWord = word.toLowerCase().trim()
  const language = options?.language ?? 'en'
  if (isBetaLanguage(language)) {
    return conductBetaResearch(normalizedWord, language, options?.signal, onProgress)
  }
  const skipOptional = options?.skipOptionalSources ?? false
  const signal = options?.signal

  // Every source fails soft: a throwing client must not reject the whole
  // Promise.all and lose the other five sources. The no-etymonline-AND-no-
  // wiktionary check below already handles the nothing-found case.
  const runSource = <T>(
    source: string,
    startTime: number,
    fetcher: () => Promise<T | null>,
    preview: (data: T | null) => string | undefined
  ): Promise<T | null> => {
    return fetcher()
      .then((data) => {
        emitProgress(onProgress, {
          type: 'source_complete',
          source,
          timing: Date.now() - startTime,
          preview: preview(data),
        })
        return data
      })
      .catch((err) => {
        console.error(`[Research] ${source} fetch failed for "${normalizedWord}":`, safeError(err))
        emitProgress(onProgress, {
          type: 'source_failed',
          source,
          error: safeError(err),
        })
        return null
      })
  }

  // Phase 1: fire ALL source fetches at once. Only etymonline + wiktionary
  // gate chain parsing and root extraction; the other sources join before
  // this function returns (each is already capped by CONFIG.timeouts.source).
  console.log(
    `[Research] Phase 1: Fetching main word "${normalizedWord}"${skipOptional ? ' (skip optional sources)' : ''}`
  )

  // Emit source_started events
  emitProgress(onProgress, { type: 'source_started', source: 'etymonline' })
  emitProgress(onProgress, { type: 'source_started', source: 'wiktionary' })
  emitProgress(onProgress, { type: 'source_started', source: 'freeDictionary' })
  if (!skipOptional) {
    emitProgress(onProgress, { type: 'source_started', source: 'urbanDictionary' })
    emitProgress(onProgress, { type: 'source_started', source: 'wikipedia' })
    emitProgress(onProgress, { type: 'source_started', source: 'incelsWiki' })
  }

  const startTime = Date.now()
  const etymonlinePromise = runSource(
    'etymonline',
    startTime,
    () => fetchEtymonline(normalizedWord, signal),
    (data) => data?.text.slice(0, 100)
  )
  const wiktionaryPromise = runSource(
    'wiktionary',
    startTime,
    () => fetchWiktionary(normalizedWord, signal),
    (data) => data?.text.slice(0, 100)
  )
  const freeDictionaryPromise = runSource(
    'freeDictionary',
    startTime,
    () => fetchFreeDictionary(normalizedWord, CONFIG.timeouts.source, signal),
    (data) => data?.origin?.slice(0, 100)
  )
  const urbanDictionaryPromise = skipOptional
    ? Promise.resolve(null)
    : runSource(
        'urbanDictionary',
        startTime,
        () => fetchUrbanDictionary(normalizedWord, signal),
        (data) => data?.text.slice(0, 100)
      )
  const wikipediaPromise = skipOptional
    ? Promise.resolve(null)
    : runSource(
        'wikipedia',
        startTime,
        () => fetchWikipedia(normalizedWord, signal),
        (data) => data?.text.slice(0, 100)
      )
  const incelsWikiPromise = skipOptional
    ? Promise.resolve(null)
    : runSource(
        'incelsWiki',
        startTime,
        () => fetchIncelsWiki(normalizedWord, signal),
        (data) => data?.text.slice(0, 100)
      )
  totalFetches += 3 + (skipOptional ? 0 : 3)

  const [etymonlineData, wiktionaryData] = await Promise.all([etymonlinePromise, wiktionaryPromise])
  signal?.throwIfAborted()

  const context: ResearchContext = {
    language: 'en',
    mainWord: {
      word: normalizedWord,
      etymonline: etymonlineData,
      wiktionary: wiktionaryData,
      freeDictionary: null,
      urbanDictionary: null,
      wikipedia: null,
      incelsWiki: null,
    },
    identifiedRoots: [],
    rootResearch: [],
    relatedResearch: [],
    totalSourcesFetched: totalFetches,
    rawSources: {},
  }

  const joinRemainingSources = async (): Promise<void> => {
    const [freeDictionaryData, urbanDictionaryData, wikipediaData, incelsWikiData] =
      await Promise.all([
        freeDictionaryPromise,
        urbanDictionaryPromise,
        wikipediaPromise,
        incelsWikiPromise,
      ])
    context.mainWord.freeDictionary = freeDictionaryData
    context.mainWord.urbanDictionary = urbanDictionaryData
    context.mainWord.wikipedia = wikipediaData
    context.mainWord.incelsWiki = incelsWikiData
    if (wikipediaData?.text && context.rawSources) {
      context.rawSources.wikipedia = wikipediaData.text
    }
  }

  // Phase 1.5: Pre-parse etymology chains from source text (CPU-only, no API calls)
  console.log('[Research] Phase 1.5: Pre-parsing etymology chains')
  const parsedChains = parseSourceTexts(
    normalizedWord,
    etymonlineData?.text ?? null,
    wiktionaryData?.text ?? null
  )
  context.parsedChains = parsedChains
  const dateAttested = parsedChains.find((c) => c.dateAttested)?.dateAttested
  if (dateAttested && context.rawSources) {
    context.rawSources.dateAttested = dateAttested
  }
  console.log(
    `[Research] Parsed ${parsedChains.length} chain(s) with ${parsedChains.reduce((sum, c) => sum + c.links.length, 0)} total links`
  )
  emitProgress(onProgress, {
    type: 'parsing_complete',
    chainCount: parsedChains.length,
  })

  // If no data found at all, return early (still join the in-flight sources)
  if (!etymonlineData && !wiktionaryData) {
    console.log('[Research] No source data found for main word')
    await joinRemainingSources()
    return context
  }

  // Phase 2: Identify roots — CPU first, LLM fallback
  const cpuRoots = extractRootsCpu(
    normalizedWord,
    etymonlineData?.text ?? null,
    wiktionaryData?.text ?? null,
    parsedChains
  )
  let identifiedRoots = cpuRoots
  if (cpuRoots.length > 0) {
    console.log(`[Research] Phase 2: CPU-derived roots: ${cpuRoots.join(', ')} (no LLM call)`)
  } else {
    console.log('[Research] Phase 2: No CPU roots found, falling back to LLM extraction')
    const { roots, usage } = await extractRootsQuick(
      normalizedWord,
      etymonlineData?.text ?? null,
      wiktionaryData?.text ?? null,
      signal
    )
    identifiedRoots = roots
    if (usage) {
      context.llmUsage = usage
    }
  }
  context.identifiedRoots = identifiedRoots
  console.log(`[Research] Identified roots: ${identifiedRoots.join(', ') || 'none'}`)
  emitProgress(onProgress, {
    type: 'roots_identified',
    roots: identifiedRoots,
  })
  signal?.throwIfAborted()

  // Phase 3: ONE parallel wave — root pages and related-term pages together.
  // Related terms are mined from the main word's text only, so they never
  // wait on root results.
  const rootsToResearch = identifiedRoots.filter(
    (root) => root !== normalizedWord && root.length > 1
  )
  const mainCombinedText = [etymonlineData?.text, wiktionaryData?.text].filter(Boolean).join(' ')
  const mainRelatedTerms = extractRelatedTerms(
    mainCombinedText,
    [normalizedWord, ...identifiedRoots],
    etymonlineData?.relatedEntries ?? []
  )

  // Budget: each root costs 2 fetches (etymonline + wiktionary), each
  // related term costs 1 (etymonline only).
  const remainingBudget = CONFIG.maxTotalFetches - totalFetches
  const rootsToFetch = rootsToResearch.slice(
    0,
    Math.min(Math.floor(remainingBudget / 2), CONFIG.maxRootsToExplore)
  )
  const relatedTermsToFetch = mainRelatedTerms
    .filter((term) => !rootsToFetch.includes(term))
    .slice(
      0,
      Math.max(
        0,
        Math.min(remainingBudget - rootsToFetch.length * 2, CONFIG.maxRelatedWordsPerRoot)
      )
    )

  if (rootsToFetch.length > 0 || relatedTermsToFetch.length > 0) {
    console.log(
      `[Research] Phase 3: Parallel wave — roots: [${rootsToFetch.join(', ')}], ` +
        `related terms: [${relatedTermsToFetch.join(', ')}]`
    )

    const [rootResults, relatedResults] = await Promise.all([
      Promise.allSettled(rootsToFetch.map((root) => fetchRootResearch(root, signal))),
      Promise.allSettled(relatedTermsToFetch.map((term) => fetchRelatedTermResearch(term, signal))),
    ])

    for (const [index, result] of rootResults.entries()) {
      if (result.status === 'fulfilled') {
        context.rootResearch.push(result.value)
        totalFetches += 2

        emitProgress(onProgress, {
          type: 'root_research',
          root: result.value.root,
          source: 'etymonline+wiktionary',
          status: 'complete',
        })
      } else {
        console.error('[Research] Root fetch failed:', safeError(result.reason))
        emitProgress(onProgress, {
          type: 'root_research',
          root: rootsToFetch[index] ?? 'unknown',
          source: 'unknown',
          status: 'failed',
        })
      }
    }

    for (const [index, result] of relatedResults.entries()) {
      if (result.status === 'fulfilled') {
        context.relatedResearch.push(result.value)
        totalFetches += 1
        continue
      }

      console.error('[Research] Related-term fetch failed:', safeError(result.reason))
      console.warn(
        `[Research] Related-term fetch skipped: ${relatedTermsToFetch[index] ?? 'unknown'}`
      )
    }
  } else {
    console.log('[Research] Phase 3: Skipping expansion (budget or no candidates found)')
  }

  await joinRemainingSources()
  signal?.throwIfAborted()

  context.totalSourcesFetched = totalFetches
  console.log(`[Research] Complete. Total fetches: ${totalFetches}`)

  return context
}

/**
 * Sanitize source text for safe embedding inside <source_data> XML tags.
 * Strips XML tags, control characters, and Unicode directional overrides
 * to prevent prompt injection via source data.
 */
function sanitizeSourceText(text: string, maxChars: number): string {
  let sanitized = text
  // Strip ALL XML-like tags
  sanitized = sanitized.replace(/<\/?[a-zA-Z][^>]*>/g, '')
  // Neutralize control characters (U+0000–U+001F except \n \t)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  // Neutralize Unicode directional overrides
  sanitized = sanitized.replace(/[\u200E\u200F\u202A-\u202E]/g, '')
  if (sanitized.length <= maxChars) {
    return sanitized
  }

  const marker = '\n[...source excerpt clipped for prompt budget...]\n'
  if (maxChars <= marker.length + 2) {
    return sanitized.slice(0, maxChars)
  }

  const headChars = Math.ceil((maxChars - marker.length) * 0.7)
  const tailChars = maxChars - marker.length - headChars
  return sanitized.slice(0, headChars) + marker + sanitized.slice(-tailChars)
}

/**
 * Build a rich prompt from research context for final synthesis.
 * Source data is wrapped in <source_data> XML tags for prompt injection
 * defense and clipped to the tiered CONFIG.promptBudget caps. Clipping keeps
 * the source opening plus tail context with an explicit omission marker; the
 * full parsed chain evidence is appended separately below.
 */
export function buildResearchPrompt(context: ResearchContext): string {
  const sections: string[] = []
  const { mainSourceChars, supplementalSourceChars, rootSourceChars, relatedSourceChars } =
    CONFIG.promptBudget

  // Main word section
  sections.push(`=== Main Word: "${context.mainWord.word}" ===`)
  if (context.mainWord.etymonline) {
    sections.push(
      `\n<source_data name="etymonline">\n${sanitizeSourceText(context.mainWord.etymonline.text, mainSourceChars)}\n</source_data>`
    )
    if (context.mainWord.etymonline.relatedEntries?.length) {
      sections.push(
        `Etymonline linked entries: ${context.mainWord.etymonline.relatedEntries.join(', ')}`
      )
    }
  }
  if (context.mainWord.wiktionary) {
    sections.push(
      `\n<source_data name="wiktionary">\n${sanitizeSourceText(context.mainWord.wiktionary.text, mainSourceChars)}\n</source_data>`
    )
  }
  const betaMainSources = [
    ['wiktionary_english_selected_language', context.mainWord.wiktionaryEnglish],
    ['wiktionary_native_edition', context.mainWord.wiktionaryNative],
    ['freedictionaryapi_senses_only', context.mainWord.multilingualDictionary],
    ['wikidata_lexeme', context.mainWord.wikidataLexeme],
    ['dicionario_aberto_historical', context.mainWord.dicionarioAberto],
  ] as const
  for (const [name, source] of betaMainSources) {
    if (source) {
      sections.push(
        `\n<source_data name="${name}">\n${sanitizeSourceText(source.text, mainSourceChars)}\n</source_data>`
      )
    }
  }
  if (context.mainWord.wikipedia) {
    sections.push(
      `\n<source_data name="wikipedia">\n${sanitizeSourceText(context.mainWord.wikipedia.text, supplementalSourceChars)}\n</source_data>`
    )
  }
  if (context.mainWord.freeDictionary) {
    sections.push(
      `\n<source_data name="free_dictionary">\n${sanitizeSourceText(compactFreeDictionary(context.mainWord.freeDictionary), supplementalSourceChars)}\n</source_data>`
    )
  }
  if (context.mainWord.urbanDictionary) {
    sections.push(
      `\n<source_data name="urban_dictionary">\n${sanitizeSourceText(context.mainWord.urbanDictionary.text, supplementalSourceChars)}\n</source_data>`
    )
  }
  if (context.mainWord.incelsWiki) {
    sections.push(
      `\n<source_data name="incels_wiki">\n${sanitizeSourceText(context.mainWord.incelsWiki.text, supplementalSourceChars)}\n</source_data>`
    )
  }

  // Identified roots
  if (context.identifiedRoots.length > 0) {
    sections.push(`\n=== Identified Root Components ===\n${context.identifiedRoots.join(', ')}`)
  }
  if (context.identifiedRootLexemes?.length) {
    sections.push(
      `Language-tagged ancestors: ${context.identifiedRootLexemes
        .map((lexeme) => `${lexeme.language}:${lexeme.word}`)
        .join(', ')}`
    )
  }

  // Root research sections
  for (const rootData of context.rootResearch) {
    sections.push(`\n=== Root: "${rootData.root}" ===`)
    if (rootData.etymonlineData) {
      sections.push(
        `<source_data name="etymonline">\n${sanitizeSourceText(rootData.etymonlineData.text, rootSourceChars)}\n</source_data>`
      )
      if (rootData.etymonlineData.relatedEntries?.length) {
        sections.push(
          `Etymonline linked entries: ${rootData.etymonlineData.relatedEntries.join(', ')}`
        )
      }
    }
    if (rootData.wiktionaryData) {
      sections.push(
        `<source_data name="wiktionary">\n${sanitizeSourceText(rootData.wiktionaryData.text, rootSourceChars)}\n</source_data>`
      )
    }
    if (rootData.relatedTerms.length > 0) {
      sections.push(`Related terms found: ${rootData.relatedTerms.join(', ')}`)
    }
  }

  for (const relatedData of context.relatedResearch) {
    sections.push(`\n=== Related Term: "${relatedData.term}" ===`)
    if (relatedData.etymonlineData) {
      sections.push(
        `<source_data name="etymonline">\n${sanitizeSourceText(relatedData.etymonlineData.text, relatedSourceChars)}\n</source_data>`
      )
    }
  }

  // Append pre-parsed etymology chains if available
  if (context.parsedChains && context.parsedChains.length > 0) {
    const chainsText = formatParsedChainsForPrompt(context.parsedChains)
    if (chainsText) {
      sections.push('\n' + chainsText)
    }
  }

  return sections.join('\n')
}
