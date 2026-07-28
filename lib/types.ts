import type { ParsedEtymChain } from './etymologyParser'
import type { FreeDictionaryEntry } from './freeDictionary'
import type { BetaLanguageCode, LanguageCode } from './languages'

export interface BilingualText {
  en: string
  local: string
}

export type ResultText = string | BilingualText

export interface LexemeRef {
  word: string
  language: string
}

/**
 * A single etymological root component of a word
 * Words can have 1 to many roots (e.g., "cat" has 1, "telephone" has 2, "autobiography" has 3)
 */
export interface Root<Text extends ResultText = string> {
  root: string // e.g., "fides"
  origin: string // e.g., "Latin"
  meaning: Text // e.g., "faith, trust"
  relatedWords: string[] // e.g., ["fidelity", "confide", "diffident"]
  ancestorRoots?: string[] // Older forms (e.g., PIE *bheid- for "fides")
  descendantWords?: string[] // Modern derivatives in other languages
}

/**
 * A source reference with name, URL, and the specific word looked up
 */
export interface SourceReference {
  name:
    | 'etymonline'
    | 'wiktionary'
    | 'freeDictionary'
    | 'urbanDictionary'
    | 'incelsWiki'
    | 'wikipedia'
    | 'wiktionaryEnglish'
    | 'wiktionaryNative'
    | 'wikidataLexeme'
    | 'multilingualDictionary'
    | 'dicionarioAberto'
    | 'synthesized'
  url?: string // URL of the actual page used (undefined for 'synthesized')
  word?: string // The specific word/root that was looked up (undefined for 'synthesized')
  sourceFamily?: 'etymonline' | 'wiktionary' | 'wikidata' | 'dicionarioAberto' | 'other'
  license?: string
}

/**
 * Evidence linking an ancestry stage to a parsed source snippet
 */
export interface StageEvidence {
  source:
    'etymonline' | 'wiktionary' | 'wiktionaryEnglish' | 'wiktionaryNative' | 'dicionarioAberto'
  snippet: string // raw text excerpt (~120 chars max)
  sourceFamily?: string
}

/**
 * Confidence level for an ancestry stage, assigned programmatically by the enricher.
 * - high: form found in 2+ source chains
 * - medium: form found in 1 source chain
 * - low: no match in any parsed chain (LLM-only)
 */
export type StageConfidence = 'high' | 'medium' | 'low'

/**
 * A stage in a single branch of the word's etymological ancestry
 */
export interface AncestryStage<Text extends ResultText = string> {
  stage: string // Language/period: "Proto-Indo-European", "Greek", "Latin", etc.
  form: string // The word form at this stage
  note: Text // Brief annotation about meaning/context at this stage
  isReconstructed?: boolean // true for PIE/*-prefixed forms
  confidence?: StageConfidence // assigned by enricher post-LLM
  evidence?: StageEvidence[] // source snippets supporting this stage
}

/**
 * A branch representing one root's evolution through time
 * Multiple branches can exist for compound words and merge together
 */
export interface AncestryBranch<Text extends ResultText = string> {
  root: string // The root this branch traces (e.g., "tele", "phone")
  stages: AncestryStage<Text>[] // Evolution stages for this root
}

/**
 * Convergence point where multiple branches share a common PIE ancestor
 * Used to visualize how seemingly unrelated words connect at deep history
 */
export interface ConvergencePoint<Text extends ResultText = string> {
  pieRoot: string // The shared Proto-Indo-European root
  meaning: Text // What the PIE root meant
  branchIndices: number[] // Which branches (by index) share this ancestor
}

/**
 * Graph-based ancestry showing how roots evolved and merged
 * Supports: single roots, compound words with merging branches, post-merge evolution
 */
export interface AncestryGraph<Text extends ResultText = string> {
  branches: AncestryBranch<Text>[] // Independent evolution paths for each root
  convergencePoints?: ConvergencePoint<Text>[] // Where branches share deep PIE ancestors
  mergePoint?: {
    // Where branches combine (for compound words)
    form: string // The combined form
    note: Text // Context about the combination
  }
  postMerge?: AncestryStage<Text>[] // Evolution after merge (optional)
}

/**
 * Part of speech type for grammatical categorization
 */
export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'preposition'
  | 'conjunction'
  | 'pronoun'
  | 'interjection'
  | 'determiner'

/**
 * Definition for a specific part of speech
 * Useful for words like "record" that have different pronunciations per POS
 */
export interface POSDefinition<Text extends ResultText = string> {
  pos: PartOfSpeech
  definition: Text
  pronunciation?: string // If different per POS (e.g., "REcord" vs "reCORD")
}

/**
 * Related word suggestions for vocabulary building
 */
export interface WordSuggestions {
  synonyms?: string[]
  antonyms?: string[]
  homophones?: string[]
  easilyConfusedWith?: string[] // e.g., "affect" vs "effect"
  seeAlso?: string[] // Related interesting words
}

/**
 * Modern and slang usage context
 * Captures contemporary meanings that may differ from etymological origins
 */
export interface ModernUsage<Text extends ResultText = string> {
  hasSlangMeaning: boolean
  slangDefinition?: Text
  popularizedBy?: Text // e.g., "popularized by TikTok in 2020s"
  contexts?: Text[] // e.g., ["LGBTQ+ community", "internet culture"]
  notableReferences?: Text[] // Famous uses in media/literature
}

export interface NgramResult {
  word: string
  data: Array<{ year: number; count: number; matchCount?: number }>
  corpus: string
}

/**
 * Token and cost usage from a single LLM call.
 * costUSD is the OpenRouter provider-reported cost when available;
 * cost accounting falls back to config pricing math when absent.
 */
export interface LlmUsage {
  inputTokens: number
  outputTokens: number
  costUSD?: number
}

/**
 * Complete etymology result for a word
 */
export interface EtymologyResultBase<Language extends LanguageCode, Text extends ResultText> {
  language: Language
  word: string
  pronunciation: string // IPA, e.g., "/pərˈfɪdiəs/"
  definition: Text // Brief definition
  roots: Root<Text>[] // 1 to many roots depending on word composition
  ancestryGraph: AncestryGraph<Text> // Graph showing how roots evolved and merged
  lore: Text // 4-6 sentence revelationary narrative with "aha" moments
  sources: SourceReference[]
  partsOfSpeech?: POSDefinition<Text>[] // Definitions per grammatical category
  suggestions?: WordSuggestions // Related words for vocabulary building
  modernUsage?: ModernUsage<Text> // Contemporary/slang meanings
  ngram?: NgramResult
  rawSources?: {
    wikipedia?: string
    dateAttested?: string
  }
}

export type EnglishEtymologyResult = Omit<EtymologyResultBase<'en', string>, 'language'> & {
  /** Legacy cache entries predate language identity; absence always means English. */
  language?: 'en'
}
export type BetaEtymologyResult = EtymologyResultBase<BetaLanguageCode, BilingualText>
export type EtymologyResult = EnglishEtymologyResult | BetaEtymologyResult
export type DisplayEtymologyResult = EtymologyResultBase<LanguageCode, string>

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Word suggestion for typo correction
 */
export interface WordSuggestion {
  word: string
  distance: number // Levenshtein distance
}

/**
 * History entry stored in localStorage
 */
export interface HistoryEntry {
  word: string
  language?: LanguageCode // absent in legacy localStorage entries means English
  timestamp: number
}

/**
 * Raw data fetched from a single external source
 */
export interface SourceData {
  text: string
  url: string
  relatedEntries?: string[]
}

/**
 * Raw data fetched from external sources before LLM synthesis
 */
export interface RawSourceData {
  etymonline?: SourceData | null
  wiktionary?: SourceData | null
}

/**
 * Research data for a single root
 */
export interface RootResearchData {
  root: string
  lexeme?: LexemeRef
  etymonlineData: SourceData | null
  wiktionaryData: SourceData | null
  relatedTerms: string[]
}

/**
 * Research data for a related term (peripheral evidence: etymonline only)
 */
export interface RelatedTermResearchData {
  term: string
  lexeme?: LexemeRef
  etymonlineData: SourceData | null
}

/**
 * Aggregated research context from agentic exploration
 */
export interface ResearchContext {
  /** Missing on legacy English fixtures and contexts; absence means English. */
  language?: LanguageCode
  mainWord: {
    word: string
    etymonline: SourceData | null
    wiktionary: SourceData | null
    freeDictionary?: FreeDictionaryEntry | null
    urbanDictionary?: SourceData | null
    wikipedia?: SourceData | null
    incelsWiki?: SourceData | null
    wiktionaryEnglish?: SourceData | null
    wiktionaryNative?: SourceData | null
    multilingualDictionary?: SourceData | null
    wikidataLexeme?: SourceData | null
    dicionarioAberto?: SourceData | null
  }
  identifiedRoots: string[]
  identifiedRootLexemes?: LexemeRef[]
  rootResearch: RootResearchData[]
  relatedResearch: RelatedTermResearchData[]
  totalSourcesFetched: number
  parsedChains?: ParsedEtymChain[] // pre-parsed etymology chains from source text
  llmUsage?: LlmUsage // root-extraction LLM usage, counted toward the budget
  rawSources?: {
    wikipedia?: string
    dateAttested?: string
  }
}

/** Protection states for cost guard budget ladder */
export type ProtectionMode = 'normal' | 'cache_only'

/** Security telemetry event emitted at key decision points */
export interface SecurityTelemetryEvent {
  type:
    | 'rate_limit'
    | 'budget_check'
    | 'cache_hit'
    | 'cache_miss'
    | 'schema_validation_fail'
    | 'protection_mode_change'
    | 'redis_health'
  timestamp: number
  detail: Record<string, unknown>
}

/**
 * Server-sent event shapes for streaming etymology synthesis
 * Emitted during the research and synthesis pipeline to provide real-time progress
 */
export type StreamEvent =
  | { type: 'source_started'; source: string }
  | {
      type: 'source_complete'
      source: string
      timing: number
      preview?: string
    }
  | { type: 'source_failed'; source: string; error: string }
  | { type: 'parsing_complete'; chainCount: number; dateAttested?: string }
  | { type: 'roots_identified'; roots: string[] }
  | { type: 'root_research'; root: string; source: string; status: string }
  | { type: 'synthesis_started' }
  /**
   * Emitted when a top-level field of the synthesis JSON closes, in schema
   * (render) order — ~10 per response. `data` is the parsed, null-stripped
   * field value; enrichment fields (confidence, evidence) and the real
   * source attributions arrive only with the terminal `result` event.
   */
  | { type: 'synthesis_section'; section: string; data: unknown }
  | { type: 'singleflight_wait'; waitedMs: number }
  | {
      type: 'enrichment_done'
      highConfidence: number
      mediumConfidence: number
    }
  | { type: 'result'; data: EtymologyResult }
  | {
      type: 'error'
      message: string
      errorType: 'rate_limit' | 'budget' | 'network' | 'nonsense' | 'typo' | 'unknown'
      suggestions?: string[]
    }
