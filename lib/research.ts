import { canonicalizeWord } from './orthography'
/**
 * Agentic research module for deep etymology exploration.
 * Conducts multi-source lookups to gather rich context about word origins
 * and constituent roots.
 */

import { fetchEtymonline } from './etymonline'
import { fetchWiktionary, fetchSelectedWiktionaryLanguage } from './wiktionary'
import { fetchWikipedia } from './wikipedia'
import { fetchIncelsWiki } from './incelsWiki'
import {
  LlmUsage,
  RelatedTermResearchData,
  ResearchContext,
  ResearchEntryContext,
  RootResearchData,
  StreamEvent,
} from './types'
import {
  parseWiktionaryText,
  parseEtymonlineText,
  formatParsedChainsForPrompt,
  type ParsedEtymChain,
} from './etymologyParser'
import { CONFIG } from './config'
import { safeError } from './errorUtils'
import { classifyApiError } from './apiError'
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
import { buildLexicalResearchGraph } from './lexemeGraph'
import { deriveEntryContexts } from './lexemeEntries'
import { SourceFetchBudget } from './sourceFetchBudget'

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
    return Boolean(
      mainWord.wiktionaryEnglish ||
      mainWord.wiktionaryNative ||
      mainWord.wikipedia ||
      mainWord.multilingualDictionary
    )
  }
  return Boolean(
    mainWord.etymonline ||
    mainWord.wiktionary ||
    mainWord.multilingualDictionary ||
    mainWord.wikipedia
  )
}

function completeResearch(context: ResearchContext, budget: SourceFetchBudget): ResearchContext {
  if (budget.rateLimited && !hasCredibleMainSource(context)) {
    throw new Error('429: research sources are rate limited')
  }
  context.totalSourcesFetched = budget.attempts
  if (
    context.rootResearch.some(
      (root) =>
        !root.etymonlineData &&
        !root.wiktionaryData &&
        !root.wiktionaryEnglish &&
        !root.wiktionaryNative
    ) ||
    !(
      context.mainWord.etymonline ||
      context.mainWord.wiktionary ||
      context.mainWord.wiktionaryEnglish ||
      context.mainWord.wiktionaryNative
    )
  ) {
    context.incompleteResearch = true
  }
  return context
}

async function conductBetaResearch(
  word: string,
  language: Exclude<LanguageCode, 'en'>,
  signal: AbortSignal | undefined,
  onProgress: ((event: StreamEvent) => void) | undefined,
  budget: SourceFetchBudget
): Promise<ResearchContext> {
  const sources = [
    ['wikipedia', () => fetchWikipedia(word, signal, language)],
    ['wiktionaryEnglish', () => fetchEnglishWiktionaryLanguage(word, language, signal)],
    ['wiktionaryNative', () => fetchNativeWiktionary(word, language, signal)],
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
        const data = await budget.run(fetcher)
        emitProgress(
          onProgress,
          data
            ? {
                type: 'source_complete',
                source: name,
                timing: Date.now() - startedAt,
                preview: data?.text.slice(0, 100),
              }
            : { type: 'source_failed', source: name, error: 'Source provided no usable evidence' }
        )
        return data
      } catch (error) {
        emitProgress(onProgress, { type: 'source_failed', source: name, error: safeError(error) })
        return null
      }
    })
  )
  signal?.throwIfAborted()

  const byName = Object.fromEntries(sources.map(([name], index) => [name, results[index]]))
  if (!byName.wiktionaryEnglish && !byName.wiktionaryNative) {
    emitProgress(onProgress, { type: 'source_started', source: 'multilingualDictionary' })
    byName.multilingualDictionary = await budget.run(() =>
      fetchFreeDictionaryApi(word, language, signal)
    )
    emitProgress(
      onProgress,
      byName.multilingualDictionary
        ? {
            type: 'source_complete',
            source: 'multilingualDictionary',
            timing: Date.now() - startedAt,
          }
        : {
            type: 'source_failed',
            source: 'multilingualDictionary',
            error: 'Source provided no usable evidence',
          }
    )
  }
  const wiktionaryEnglish = byName.wiktionaryEnglish ?? null
  const wiktionaryNative = byName.wiktionaryNative ?? null
  // Native structured groups define history boundaries; the other edition stays independent.
  const primarySource = wiktionaryNative?.entryGroups?.length
    ? (['wiktionaryNative', wiktionaryNative] as const)
    : (['wiktionaryEnglish', wiktionaryEnglish] as const)
  let entryContexts: ResearchEntryContext[] = deriveEntryContexts(
    word,
    language,
    primarySource[0],
    primarySource[1],
    byName.wikidataLexeme ?? null
  )
  const fallback = byName.wikipedia ?? byName.multilingualDictionary
  signal?.throwIfAborted()
  const fallbackName = byName.wikipedia ? 'wikipedia' : 'multilingualDictionary'
  if (entryContexts.length === 0 && fallback) {
    entryContexts = [
      {
        id: `history:${language}:${encodeURIComponent(word)}:unresolved`,
        evidenceScopeId: `scope:${language}:${encodeURIComponent(word)}:${fallbackName}`,
        source: fallbackName,
        heading: word,
        text: fallback.text,
        sectionHeadings: [],
        sourceUrl: fallback.url,
        entryKind: 'unresolved',
      },
    ]
  }
  const parsedChains = entryContexts.flatMap((entry) => {
    if (entry.source !== 'wiktionaryEnglish' && entry.source !== 'wiktionaryNative') return []
    const chain = parseWiktionaryText(entry.text, word, {
      historyId: entry.id,
      evidenceScopeId: entry.evidenceScopeId,
      provider: entry.source,
    })
    return chain.links.length > 0 ? [chain] : []
  })
  const lexicalGraph = buildLexicalResearchGraph(word, language, entryContexts, parsedChains)
  const identifiedRootLexemes = parsedChains
    .flatMap((chain) => chain.links)
    .filter((link) => canonicalizeWord(link.form) !== canonicalizeWord(word))
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

  const context: ResearchContext = {
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
      wikipedia: byName.wikipedia ?? null,
    },
    identifiedRoots: identifiedRootLexemes.map((lexeme) => lexeme.word),
    identifiedRootLexemes,
    rootResearch: [],
    relatedResearch: [],
    parsedChains,
    entryContexts,
    lexicalGraph,
    totalSourcesFetched: budget.attempts,
  }
  await expandLexemes(context, budget, signal)
  signal?.throwIfAborted()
  return completeResearch(context, budget)
}

/** English uses the same source-defined entry identities as selected-language research. */
export function scopeEnglishHistories(context: ResearchContext): void {
  const word = context.mainWord.word
  const primary = context.mainWord.wiktionary
    ? (['wiktionary', context.mainWord.wiktionary] as const)
    : (['etymonline', context.mainWord.etymonline] as const)
  let entries = deriveEntryContexts(word, 'en', primary[0], primary[1], null)
  if (!entries.length) {
    const source = context.mainWord.wikipedia ?? context.mainWord.multilingualDictionary
    entries = [
      {
        id: `history:en:${encodeURIComponent(word)}:unresolved`,
        evidenceScopeId: `scope:en:${encodeURIComponent(word)}:unresolved`,
        source: context.mainWord.wikipedia ? 'wikipedia' : 'multilingualDictionary',
        heading: word,
        text: source?.text ?? '',
        sectionHeadings: [],
        sourceUrl: source?.url ?? '',
        entryKind: 'unresolved',
      },
    ]
  }
  const chains = entries.flatMap((entry) => {
    if (entry.source === 'wikipedia' || entry.source === 'multilingualDictionary') return []
    const parsed =
      entry.source === 'etymonline'
        ? parseEtymonlineText(entry.text, word)
        : parseWiktionaryText(entry.text, word)
    return parsed.links.length
      ? [
          {
            ...parsed,
            historyId: entry.id,
            evidenceScopeId: entry.evidenceScopeId,
          },
        ]
      : []
  })
  context.entryContexts = entries
  context.parsedChains = chains
  context.lexicalGraph = buildLexicalResearchGraph(word, 'en', entries, chains)
}

/** Components describe their own lexemes, never attest the phrase's history. */
export function phraseComponents(word: string, language: LanguageCode): string[] {
  const particles = new Set(
    {
      en: ['the', 'of', 'and', 'a', 'an'],
      fr: ['de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et'],
      it: ['di', 'da', 'del', 'della', 'il', 'lo', 'la', 'e'],
      es: ['de', 'del', 'la', 'el', 'los', 'las', 'y'],
      pt: ['de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'e'],
    }[language]
  )
  if (!/\s/u.test(word)) return []
  return [...new Set(word.split(/\s+/u).map(canonicalizeWord))]
    .filter((part) => part.length > 1 && !particles.has(part))
    .slice(0, CONFIG.maxRootsToExplore)
}

export async function expandLexemes(
  context: ResearchContext,
  budget: SourceFetchBudget,
  signal?: AbortSignal
): Promise<void> {
  const language = context.language ?? 'en'
  const word = context.mainWord.word
  const history = context.entryContexts?.length === 1 ? context.entryContexts[0] : undefined
  const seen = new Set([`${language}:${word}`])
  const variants = [
    context.mainWord.etymonline,
    context.mainWord.wiktionary,
    context.mainWord.wiktionaryEnglish,
    context.mainWord.wiktionaryNative,
    context.mainWord.wikipedia,
  ].flatMap((source) => source?.variants ?? [])
  type Candidate = {
    word: string
    relationship: 'spelling-variant' | 'redirect' | 'component'
    parentWord?: string
    parentHistoryId?: string
    sourceUrl?: string
  }
  const fetchWave = async (candidates: Candidate[]): Promise<Candidate[]> => {
    const unique = candidates
      .filter((candidate) => {
        const key = `${language}:${canonicalizeWord(candidate.word)}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, CONFIG.maxRootsToExplore)
    const results = await Promise.all(
      unique.map(async (candidate) => {
        signal?.throwIfAborted()
        const term = canonicalizeWord(candidate.word)
        const fetchers =
          language === 'en'
            ? [
                () => fetchEtymonline(term, signal),
                () => fetchWiktionary(term, signal, { retryTransient: true }),
              ]
            : [
                () => fetchEnglishWiktionaryLanguage(term, language, signal),
                () => fetchNativeWiktionary(term, language, signal),
              ]
        const sources = await Promise.all(
          fetchers.map((fetcher) => budget.run(fetcher).catch(() => null))
        )
        context.rootResearch.push({
          root: term,
          lexeme: { word: term, language },
          relationship: candidate.relationship,
          // Components have an independent scope and never inherit a homograph's history.
          parentHistoryId: candidate.parentHistoryId,
          variantOf:
            candidate.relationship !== 'component'
              ? { word: candidate.parentWord ?? word, language }
              : undefined,
          relationshipSourceUrl: candidate.sourceUrl,
          evidenceScopeId: `scope:${language}:${encodeURIComponent(candidate.parentWord ?? word)}:${candidate.relationship}:${encodeURIComponent(term)}`,
          etymonlineData: language === 'en' ? sources[0] : null,
          wiktionaryData: language === 'en' ? sources[1] : sources[0],
          wiktionaryEnglish: language !== 'en' ? sources[0] : undefined,
          wiktionaryNative: language !== 'en' ? sources[1] : undefined,
          relatedTerms: [],
        })
        return sources
          .flatMap((source) => source?.variants ?? [])
          .map((variant) => ({
            word: variant.word,
            relationship: variant.relationship,
            parentWord: term,
            parentHistoryId: candidate.parentHistoryId,
            sourceUrl: variant.url,
          }))
      })
    )
    return results.flat()
  }
  // Identity and component variants take priority over ancestors and related pages.
  const phraseVariants = await fetchWave(
    variants.map((variant) => ({
      word: variant.word,
      relationship: variant.relationship,
      parentWord: word,
      parentHistoryId: history?.id,
      sourceUrl: variant.url,
    }))
  )
  const componentVariants = await fetchWave(
    phraseComponents(word, language).map((component) => ({
      word: component,
      relationship: 'component',
    }))
  )
  await fetchWave([...phraseVariants, ...componentVariants])
  const ancestors = (context.parsedChains ?? [])
    .flatMap((chain) => chain.links.map((link) => ({ chain, link })))
    .filter(({ link }) => !link.isReconstructed && link.form !== word)
    .slice(0, CONFIG.maxRootsToExplore)
  await Promise.all(
    ancestors.map(async ({ chain, link }) => {
      const key = `${link.language}:${canonicalizeWord(link.form)}`
      if (seen.has(key)) return
      seen.add(key)
      const data = await budget
        .run(() =>
          fetchSelectedWiktionaryLanguage(link.form, link.language, signal, {
            retryTransient: true,
          })
        )
        .catch(() => null)
      if (!data) {
        context.incompleteResearch = true
        return
      }
      context.rootResearch.push({
        root: link.form,
        lexeme: { word: link.form, language: link.language },
        relationship: 'root',
        parentHistoryId: chain.historyId,
        evidenceScopeId: chain.evidenceScopeId,
        etymonlineData: null,
        wiktionaryData: data,
        relatedTerms: [],
      })
    })
  )
}

export async function extractRootsQuick(
  word: string,
  etymonlineText: string | null,
  wiktionaryText: string | null,
  signal?: AbortSignal
): Promise<RootExtraction> {
  const sourceText = [etymonlineText, wiktionaryText]
    .filter((text): text is string => Boolean(text))
    .map((text) => sanitizeSourceText(text))
    .join('\n\n')

  if (!sourceText) {
    return { roots: [], usage: null }
  }

  const prompt = `Analyze this etymology data and extract the ETYMOLOGICAL root morphemes of the word "${word}".

Rules:
- Preserve all accents, vowel-length marks, modifier letters and affix hyphens exactly as supplied by the source. Never replace a historical form with a similarly spelled modern word.
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
    if (signal?.aborted || classifyApiError(error).status === 422) throw error
    console.error('Root extraction error:', safeError(error))
    const usage =
      error && typeof error === 'object' && 'usage' in error
        ? (error as { usage?: LlmUsage }).usage
        : undefined
    return { roots: [], usage: usage ?? null }
  }

  // The call was billed even if the output is unusable — always report usage.
  const usage = extractUsage(response)
  try {
    return { roots: parseRootsArray(extractOutputText(response)), usage }
  } catch (error) {
    if (classifyApiError(error).status === 422) throw error
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
      .map(canonicalizeWord)
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

const TERM_PATTERN = /[\p{L}*][\p{L}\p{M}\p{N}*'’ʼ‐‑.-]*/gu
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
    String.raw`\s+((?:[\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+(?:\s*(?:${FORMULA_ANNOTATION.source}))*\s*\+\s*)+[\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)`,
  'giu'
)

/**
 * Extract the individual morphemes of every "X + Y (+ Z)" derivation formula
 * in the text, stripping gloss annotations. Returns raw parts — callers
 * normalize/filter them.
 */
function extractDerivationParts(text: string): string[] {
  const cleaned = text.normalize('NFC').replace(/[\u200E\u200F]/g, '')
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
 * Normalize a raw CPU root candidate without changing lexical marks or
 * affix boundaries. Source page titles must not determine root spelling.
 * Reject reconstructed forms, the word itself, and inflectional suffixes.
 */
function normalizeRootCandidate(term: string, word: string): string | null {
  const normalized = canonicalizeWord(term)
    .replace(/[\u200E\u200F]/g, '')
    .replace(/^[.,;:]+/, '')
    .replace(/[.,;:]+$/, '')
    .trim()

  if (!normalized || normalized.includes('*')) return null
  if (/\s/.test(normalized)) return null
  if (normalized.length < 2) return null
  if (normalized === word) return null
  if (LOW_SIGNAL_AFFIXES.has(normalized.replace(/^[-‐‑]+|[-‐‑]+$/g, ''))) return null
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
  const normalizedWord = canonicalizeWord(word)
  const combinedText = [etymonlineText, wiktionaryText].filter(Boolean).join('\n')
  const candidates = extractDerivationParts(combinedText)

  for (const chain of parsedChains) {
    for (const link of chain.links) {
      if (link.isReconstructed) continue
      const form = link.form.replace(/[\u200E\u200F]/g, '')
      // Affix notation ("tele-", "-phone") marks a morpheme worth researching
      if (/^[-‐‑]\p{L}/u.test(form) || /[\p{L}\p{M}][-‐‑]$/u.test(form)) {
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
  const normalized = canonicalizeWord(term).replace(/[.,;:()]+$/g, '')
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
    /related to ([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /cognate with ([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /see also ([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /compare ([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /akin to ([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /ultimately (?:derived )?from [^.\n;:]*?([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /borrowed from [^.\n;:]*?([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /derived from [^.\n;:]*?([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /inherited from [^.\n;:]*?([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)/giu,
    /from (\w+) ["']([\p{L}\p{M}\p{N}*'’ʼ‐‑.-]+)["']/giu,
  ]

  const scores = new Map<string, number>()
  const excludeLower = new Set(excludeWords.map(canonicalizeWord))

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
    const trimmed = canonicalizeWord(part)
    if (LOW_SIGNAL_AFFIXES.has(trimmed.replace(/^[-‐‑]+|[-‐‑]+$/g, ''))) continue
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
    fetchWiktionary(root, signal, { retryTransient: true }),
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
  const budget = new SourceFetchBudget(CONFIG.maxTotalFetches)
  const normalizedWord = canonicalizeWord(word)
  const language = options?.language ?? 'en'
  if (isBetaLanguage(language)) {
    return conductBetaResearch(normalizedWord, language, options?.signal, onProgress, budget)
  }
  const skipOptional = options?.skipOptionalSources ?? false
  const signal = options?.signal

  // A failing source must not discard the remaining source bundle.
  const runSource = <T>(
    source: string,
    startTime: number,
    fetcher: () => Promise<T | null>,
    preview: (data: T | null) => string | undefined
  ): Promise<T | null> => {
    return budget
      .run(fetcher)
      .then((data) => {
        emitProgress(
          onProgress,
          data
            ? {
                type: 'source_complete',
                source,
                timing: Date.now() - startTime,
                preview: preview(data),
              }
            : { type: 'source_failed', source, error: 'Source provided no usable evidence' }
        )
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

  // Direct Wiktionary evidence gates its senses-only fallback. Independent
  // sources start together and join before evidence enrichment.
  console.log(
    `[Research] Phase 1: Fetching main word "${normalizedWord}"${skipOptional ? ' (skip optional sources)' : ''}`
  )

  emitProgress(onProgress, { type: 'source_started', source: 'etymonline' })
  emitProgress(onProgress, { type: 'source_started', source: 'wiktionary' })
  if (!skipOptional) {
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
  const dictionaryFallbackPromise = wiktionaryPromise.then((data) => {
    if (data || signal?.aborted) return null
    emitProgress(onProgress, { type: 'source_started', source: 'multilingualDictionary' })
    return runSource(
      'multilingualDictionary',
      startTime,
      () => fetchFreeDictionaryApi(normalizedWord, 'en', signal),
      (data) => data?.text.slice(0, 100)
    )
  })
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

  const [etymonlineData, wiktionaryData] = await Promise.all([etymonlinePromise, wiktionaryPromise])
  signal?.throwIfAborted()

  const context: ResearchContext = {
    language: 'en',
    mainWord: {
      word: normalizedWord,
      etymonline: etymonlineData,
      wiktionary: wiktionaryData,
      multilingualDictionary: null,
      wikipedia: null,
      incelsWiki: null,
    },
    identifiedRoots: [],
    rootResearch: [],
    relatedResearch: [],
    totalSourcesFetched: budget.attempts,
    rawSources: {},
  }

  const joinRemainingSources = async (): Promise<void> => {
    const [dictionaryFallbackData, wikipediaData, incelsWikiData] = await Promise.all([
      dictionaryFallbackPromise,
      wikipediaPromise,
      incelsWikiPromise,
    ])
    context.mainWord.multilingualDictionary = dictionaryFallbackData
    context.mainWord.wikipedia = wikipediaData
    context.mainWord.incelsWiki = incelsWikiData
    if (wikipediaData?.text && context.rawSources) {
      context.rawSources.wikipedia = wikipediaData.text
    }
  }

  // Phase 1.5: Pre-parse etymology chains from source text (CPU-only, no API calls)
  console.log('[Research] Phase 1.5: Pre-parsing etymology chains')
  scopeEnglishHistories(context)
  const parsedChains = context.parsedChains ?? []
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
    scopeEnglishHistories(context)
    await expandLexemes(context, budget, signal)
    return completeResearch(context, budget)
  }

  // Phase 2: Identify roots — CPU first, LLM fallback
  const cpuRoots = [
    ...new Set([
      ...phraseComponents(normalizedWord, language),
      // Secondary edition formulas are research candidates, never corroborating
      // chains or an assertion that independent source histories form a compound.
      ...extractRootsCpu(normalizedWord, etymonlineData?.text ?? null, null, []),
      ...(context.entryContexts ?? []).flatMap((entry) =>
        extractRootsCpu(
          normalizedWord,
          entry.text,
          null,
          parsedChains.filter((chain) => chain.historyId === entry.id)
        )
      ),
    ]),
  ].slice(0, CONFIG.maxRootsToExplore)
  const identifyRoots = async () => {
    let identifiedRoots = cpuRoots
    if (cpuRoots.length === 0 && context.entryContexts?.length === 1) {
      const { roots, usage } = await extractRootsQuick(
        normalizedWord,
        context.entryContexts[0].text,
        null,
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
    return identifiedRoots
  }

  // Identity/component/ancestor enrichment uses source-defined histories,
  // independently of the root-extraction LLM. All primary sources still join
  // before enrichment, preserving their HTTP budget priority and complete text.
  const [identifiedRoots] = await Promise.all([
    identifyRoots(),
    joinRemainingSources().then(() => expandLexemes(context, budget, signal)),
  ])

  // Expand phrase identity first, then roots and main-word related terms.
  const rootsToResearch = identifiedRoots.filter(
    (root) =>
      root !== normalizedWord &&
      root.length > 1 &&
      !parsedChains.some((chain) =>
        chain.links.some((link) => canonicalizeWord(link.form) === root)
      )
  )
  const mainCombinedText = [etymonlineData?.text, wiktionaryData?.text].filter(Boolean).join(' ')
  const mainRelatedTerms = extractRelatedTerms(
    mainCombinedText,
    [normalizedWord, ...identifiedRoots],
    etymonlineData?.relatedEntries ?? []
  )

  // Candidate breadth complements the shared actual-HTTP budget.
  const remainingBudget = budget.remaining
  const rootsToFetch = rootsToResearch
    .filter((root) => !context.rootResearch.some((data) => data.root === root))
    .slice(0, Math.min(Math.floor(remainingBudget / 2), CONFIG.maxRootsToExplore))
  if (
    rootsToResearch.some(
      (root) =>
        !rootsToFetch.includes(root) && !context.rootResearch.some((data) => data.root === root)
    )
  )
    context.incompleteResearch = true
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
      Promise.allSettled(
        rootsToFetch.map((root) => budget.run(() => fetchRootResearch(root, signal)))
      ),
      Promise.allSettled(
        relatedTermsToFetch.map((term) => budget.run(() => fetchRelatedTermResearch(term, signal)))
      ),
    ])

    for (const [index, result] of rootResults.entries()) {
      if (result.status === 'fulfilled') {
        const owners = (context.entryContexts ?? []).filter((entry) =>
          extractRootsCpu(normalizedWord, entry.text, null, []).includes(result.value.root)
        )
        context.rootResearch.push({
          ...result.value,
          relationship: 'root',
          parentHistoryId: owners.length === 1 ? owners[0].id : undefined,
          evidenceScopeId: `scope:en:root:${encodeURIComponent(result.value.root)}`,
        })

        emitProgress(onProgress, {
          type: 'root_research',
          root: result.value.root,
          source: 'etymonline+wiktionary',
          status:
            result.value.etymonlineData || result.value.wiktionaryData ? 'complete' : 'failed',
        })
      } else {
        context.incompleteResearch = true
        console.error('[Research] Root fetch failed:', safeError(result.reason))
        emitProgress(onProgress, {
          type: 'root_research',
          root: rootsToFetch[index] ?? 'unknown',
          source: 'unknown',
          status: 'failed',
        })
      }
    }

    for (const result of relatedResults) {
      if (result.status === 'fulfilled') {
        context.relatedResearch.push(result.value)
        continue
      }

      console.error('[Research] Related-term fetch failed:', safeError(result.reason))
    }
  } else {
    console.log('[Research] Phase 3: Skipping expansion (budget or no candidates found)')
  }

  signal?.throwIfAborted()

  console.log(`[Research] Complete. Total HTTP requests: ${budget.attempts}`)
  return completeResearch(context, budget)
}

/**
 * Sanitize source text for safe embedding inside <source_data> XML tags.
 * Strips XML tags, control characters, and Unicode directional overrides
 * to prevent prompt injection via source data.
 */
function sanitizeSourceText(text: string): string {
  let sanitized = text
  // Strip ALL XML-like tags
  sanitized = sanitized.replace(/<\/?[a-zA-Z][^>]*>/g, '')
  // Neutralize control characters (U+0000–U+001F except \n \t)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  // Neutralize Unicode directional overrides
  sanitized = sanitized.replace(/[\u200E\u200F\u202A-\u202E]/g, '')
  return sanitized
}

/**
 * Build a rich prompt from research context for final synthesis.
 * Source data is wrapped in <source_data> XML tags for prompt injection
 * defense. Full source content and parsed evidence are retained.
 */
export function buildResearchPrompt(context: ResearchContext): string {
  const sections: string[] = []

  sections.push(
    'Research components and variants independently. Component origins do not prove the whole phrase history. Preserve the requested query spelling.'
  )
  if (context.entryContexts?.some((entry) => entry.source === 'multilingualDictionary')) {
    sections.push(
      'FreeDictionaryAPI supplies senses, forms and pronunciation only. Its unresolved histories must have empty roots and ancestry graphs, and must clearly state that the available evidence does not establish the origin. Never infer an origin from a definition.'
    )
  }
  for (const source of [
    context.mainWord.etymonline,
    context.mainWord.wiktionary,
    context.mainWord.wiktionaryEnglish,
    context.mainWord.wiktionaryNative,
    context.mainWord.wikipedia,
  ]) {
    if (source?.variants?.length)
      sections.push(
        `Explicit source variants for ${source.requestedWord ?? context.mainWord.word}: ${sanitizeSourceText(JSON.stringify(source.variants))}`
      )
  }
  // Main word section
  sections.push(`=== Main Word: "${context.mainWord.word}" ===`)
  if (context.mainWord.etymonline) {
    sections.push(
      `\n<source_data name="etymonline">\n${sanitizeSourceText(context.mainWord.etymonline.text)}\n</source_data>`
    )
    if (context.mainWord.etymonline.relatedEntries?.length) {
      sections.push(
        `Etymonline linked entries: ${context.mainWord.etymonline.relatedEntries.join(', ')}`
      )
    }
  }
  if (context.mainWord.wiktionary) {
    sections.push(
      `\n<source_data name="wiktionary">\n${sanitizeSourceText(context.mainWord.wiktionary.text)}\n</source_data>`
    )
  }
  if (context.entryContexts?.length) {
    sections.push('\n=== Immutable Lexical Histories ===')
    sections.push(
      'Keep every history ID independent. Do not merge, split, rename, or move evidence between histories. Unscoped complete source text stays independent context; matching spelling alone cannot align it to a history.'
    )
    for (const entry of context.entryContexts) {
      sections.push(
        `\n<source_data name="${entry.source}" history_id="${entry.id}" evidence_scope_id="${entry.evidenceScopeId}">\n${sanitizeSourceText(entry.text)}\n</source_data>`
      )
      if (entry.sectionHeadings.length > 0) {
        sections.push(`Section context: ${entry.sectionHeadings.join(' > ')}`)
      }
    }
  }

  const betaMainSources = [
    ...([
      ['wiktionary_english_selected_language', context.mainWord.wiktionaryEnglish],
      ['wiktionary_native_edition', context.mainWord.wiktionaryNative],
    ] as const),
    ['freedictionaryapi_senses_only', context.mainWord.multilingualDictionary],
    ['wikidata_lexeme', context.mainWord.wikidataLexeme],
    ['dicionario_aberto_historical', context.mainWord.dicionarioAberto],
  ] as const
  for (const [name, source] of betaMainSources) {
    if (source) {
      sections.push(
        `\n<source_data name="${name}">\n${sanitizeSourceText(source.text)}\n</source_data>`
      )
    }
  }
  if (context.mainWord.wikipedia) {
    sections.push(
      `\n<source_data name="wikipedia">\n${sanitizeSourceText(context.mainWord.wikipedia.text)}\n</source_data>`
    )
  }
  if (context.mainWord.incelsWiki) {
    sections.push(
      `\n<source_data name="incels_wiki">\n${sanitizeSourceText(context.mainWord.incelsWiki.text)}\n</source_data>`
    )
  }

  // Identified roots
  if (context.identifiedRoots.length > 0) {
    sections.push(
      `\n=== Root Research Candidates (independent histories; not a combined derivation formula) ===\n${context.identifiedRoots.join(', ')}`
    )
  }
  if (context.identifiedRootLexemes?.length) {
    sections.push(
      `Language-tagged ancestors: ${context.identifiedRootLexemes
        .map((lexeme) => `${lexeme.language}:${lexeme.word}`)
        .join(', ')}`
    )
  }
  if (context.lexicalGraph) {
    const graphSummary = {
      histories: context.lexicalGraph.histories,
      nodes: context.lexicalGraph.nodes,
      edges: context.lexicalGraph.edges,
    }
    sections.push(
      `\n=== Source-Built Lexical Graph ===\n${sanitizeSourceText(JSON.stringify(graphSummary))}`
    )
  }

  // Root research sections
  for (const rootData of context.rootResearch) {
    sections.push(
      `\n=== ${rootData.relationship ?? 'root'}: "${rootData.root}"; language=${rootData.lexeme?.language ?? context.language ?? 'en'}; parent_history=${rootData.parentHistoryId ?? 'none'}; evidence_scope=${rootData.evidenceScopeId ?? 'independent'}; variant_of=${rootData.variantOf ? `${rootData.variantOf.language}:${rootData.variantOf.word}` : 'none'}; relationship_source=${rootData.relationshipSourceUrl ?? 'none'} ===`
    )
    if (rootData.etymonlineData) {
      sections.push(
        `<source_data name="etymonline">\n${sanitizeSourceText(rootData.etymonlineData.text)}\n</source_data>`
      )
      if (rootData.etymonlineData.relatedEntries?.length) {
        sections.push(
          `Etymonline linked entries: ${rootData.etymonlineData.relatedEntries.join(', ')}`
        )
      }
    }
    if (rootData.wiktionaryData) {
      sections.push(
        `<source_data name="wiktionary">\n${sanitizeSourceText(rootData.wiktionaryData.text)}\n</source_data>`
      )
    }
    if (
      rootData.wiktionaryEnglish &&
      rootData.wiktionaryEnglish.text !== rootData.wiktionaryData?.text
    ) {
      sections.push(
        `<source_data name="wiktionary_english_selected_language">\n${sanitizeSourceText(rootData.wiktionaryEnglish.text)}\n</source_data>`
      )
    }
    for (const source of [
      rootData.etymonlineData,
      rootData.wiktionaryData,
      rootData.wiktionaryEnglish,
      rootData.wiktionaryNative,
    ]) {
      if (source?.requestedWord || source?.resolvedWord)
        sections.push(
          `Source identity: ${sanitizeSourceText(JSON.stringify({ requestedWord: source.requestedWord, resolvedWord: source.resolvedWord, url: source.url, variants: source.variants }))}`
        )
    }
    if (rootData.wiktionaryNative) {
      sections.push(
        `<source_data name="wiktionary_native">\n${sanitizeSourceText(rootData.wiktionaryNative.text)}\n</source_data>`
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
        `<source_data name="etymonline">\n${sanitizeSourceText(relatedData.etymonlineData.text)}\n</source_data>`
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
