import type { ParsedEtymChain } from './etymologyParser'
import type { LanguageCode } from './languages'
import type { WiktionaryEntryGroup } from './wiktionaryEntryGroups'
import type { SourceProviderId, SourceFamilyId } from './sourceProviders'
export type { SourceProviderId, SourceFamilyId } from './sourceProviders'

export interface LexemeRef {
  word: string
  language: string
}

export type LexicalRelation =
  | 'inherited_from'
  | 'borrowed_from'
  | 'derived_from'
  | 'compound_from'
  | 'calqued_from'
  | 'form_of'
  | 'variant_of'
  | 'semantic_extension_of'
  | 'cognate_with'

export type LexicalEdgeRole = 'ancestry' | 'morphology' | 'semantics' | 'context'

export interface LexemeIdentity {
  language: string
  lemma: string
  normalizedLemma: string
  authorityId?: string
}

export interface LexicalNode {
  id: string
  kind: 'lexeme' | 'form' | 'etymon'
  lexeme: LexemeIdentity
  displayForm: string
  grammaticalFeatures?: string[]
  isReconstructed?: boolean
  senseIds: string[]
}

export interface LexicalEvidence {
  id: string
  provider: string
  sourceFamily: SourceFamilyId
  sourceUrl: string
  evidenceScopeId: string
  subjectKind: 'node' | 'edge'
  snippet: string
}

export interface LexicalEdge {
  id: string
  from: string
  to: string
  relation: LexicalRelation
  role: LexicalEdgeRole
  evidenceIds: string[]
  confidence: StageConfidence
}

export interface LexicalHistoryCandidate {
  id: string
  entryKind: 'lemma' | 'form' | 'unresolved'
  queryNodeId: string
  lemmaNodeId: string
  formOf?: LexemeRef
  nodeIds: string[]
  edgeIds: string[]
  evidenceScopeIds: string[]
}

export interface LexicalResearchGraph {
  nodes: Record<string, LexicalNode>
  edges: Record<string, LexicalEdge>
  evidence: Record<string, LexicalEvidence>
  histories: LexicalHistoryCandidate[]
}

/**
 * A single etymological root component of a word
 * Words can have 1 to many roots (e.g., "cat" has 1, "telephone" has 2, "autobiography" has 3)
 */
export interface Root {
  root: string // e.g., "fides"
  origin: string // e.g., "Latin"
  meaning: string // e.g., "faith, trust"
  relatedWords: string[] // e.g., ["fidelity", "confide", "diffident"]
  ancestorRoots?: string[] // Older forms (e.g., PIE *bheid- for "fides")
  descendantWords?: string[] // Modern derivatives in other languages
}

/**
 * A source reference with name, URL, and the specific word looked up
 */
export interface SourceReference {
  name: SourceProviderId | 'synthesized'
  url?: string // URL of the actual page used (undefined for 'synthesized')
  word?: string // The specific word/root that was looked up (undefined for 'synthesized')
  sourceFamily?: SourceFamilyId
  license?: string
}

/**
 * Evidence linking an ancestry stage to a parsed source snippet
 */
export interface StageEvidence {
  source: SourceProviderId
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
export interface AncestryStage {
  stage: string // Language/period: "Proto-Indo-European", "Greek", "Latin", etc.
  form: string // The word form at this stage
  note: string // Brief annotation about meaning/context at this stage
  isReconstructed?: boolean // true for PIE/*-prefixed forms
  confidence?: StageConfidence // assigned by enricher post-LLM
  evidence?: StageEvidence[] // source snippets supporting this stage
}

/**
 * A branch representing one root's evolution through time
 * Multiple branches can exist for compound words and merge together
 */
export interface AncestryBranch {
  root: string // The root this branch traces (e.g., "tele", "phone")
  stages: AncestryStage[] // Evolution stages for this root
}

/**
 * Convergence point where multiple branches share a common PIE ancestor
 * Used to visualize how seemingly unrelated words connect at deep history
 */
export interface ConvergencePoint {
  pieRoot: string // The shared Proto-Indo-European root
  meaning: string // What the PIE root meant
  branchIndices: number[] // Which branches (by index) share this ancestor
}

/**
 * Graph-based ancestry showing how roots evolved and merged
 * Supports: single roots, compound words with merging branches, post-merge evolution
 */
export interface AncestryGraph {
  branches: AncestryBranch[] // Independent evolution paths for each root
  convergencePoints?: ConvergencePoint[] // Where branches share deep PIE ancestors
  mergePoint?: {
    // Where branches combine (for compound words)
    form: string // The combined form
    note: string // Context about the combination
  }
  postMerge?: AncestryStage[] // Evolution after merge (optional)
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
export interface POSDefinition {
  pos: PartOfSpeech
  definition: string
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
export interface ModernUsage {
  hasSlangMeaning: boolean
  slangDefinition?: string
  popularizedBy?: string // e.g., "popularized by TikTok in 2020s"
  contexts?: string[] // e.g., ["LGBTQ+ community", "internet culture"]
  notableReferences?: string[] // Famous uses in media/literature
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
 * A usage sentence in the word's own language. `translation` is its English
 * gloss and is absent for English words.
 */
export interface UsageExample {
  text: string
  translation?: string
}

/** The entry fields each lexical history carries; the result projects its primary history. */
interface HistoryEntryFields {
  pronunciation: string // IPA, e.g., "/pərˈfɪdiəs/"
  definition: string // Brief definition
  roots: Root[] // 1 to many roots depending on word composition
  ancestryGraph: AncestryGraph // Graph showing how roots evolved and merged
  lore: string // 4-6 sentence revelationary narrative with "aha" moments
  /** Two contrasting example sentences. Absent on entries cached before the field existed. */
  examples?: UsageExample[]
  partsOfSpeech?: POSDefinition[] // Definitions per grammatical category
}

/** One independently selectable lexical history for a same-spelling query. */
export interface LexicalHistory extends HistoryEntryFields {
  id: string
  label: string
  entryKind: 'lemma' | 'form' | 'unresolved'
  queryNodeId: string
  lemmaNodeId: string
  formOf?: LexemeRef
  evidenceScopeIds: string[]
}

/**
 * Complete etymology result for a word. Every prose field is English; only
 * `examples[].text` is written in the word's own language.
 */
export interface EtymologyResult extends HistoryEntryFields {
  language: LanguageCode
  word: string
  primaryHistoryId: string
  histories: LexicalHistory[]
  sources: SourceReference[]
  suggestions?: WordSuggestions // Related words for vocabulary building
  modernUsage?: ModernUsage // Contemporary/slang meanings
  ngram?: NgramResult
  rawSources?: {
    wikipedia?: string
    dateAttested?: string
  }
}

/**
 * The fields an entry renders: a result projected onto one of its histories,
 * or the sections of a streaming synthesis received so far.
 */
export type EtymologyEntry = Omit<EtymologyResult, 'primaryHistoryId' | 'histories'>

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
 * Raw data fetched from a single external source
 */
export interface SourceData {
  text: string
  url: string
  relatedEntries?: string[]
  entryGroups?: WiktionaryEntryGroup[]
  requestedWord?: string
  resolvedWord?: string
  language?: LanguageCode
  variants?: Array<{ word: string; relationship: 'spelling-variant' | 'redirect'; url: string }>
  revisionId?: number | string
  sourceFamily?: SourceFamilyId
  sourceEntryId?: string
  lexicalLanguage?: string
  evidenceRole?: 'etymology' | 'lexical' | 'context'
  incomplete?: boolean
  retrieval?: {
    method: 'direct' | 'exa'
    retrievedAt: string
    requestId?: string
    cacheStatus?: string
  }
}

export interface SourceRecord {
  provider: SourceProviderId
  sourceFamily: SourceFamilyId
  data: SourceData
  evidenceRole?: 'etymology' | 'lexical' | 'context'
}

export interface SourceOutcome {
  status: 'found' | 'not_found' | 'no_evidence' | 'blocked' | 'unavailable' | 'budget_skipped'
  reason?: string
  httpStatus?: number
}

export type SourceFetchOutcome =
  | { status: 'found'; data: SourceData }
  | { status: Exclude<SourceOutcome['status'], 'found'>; reason?: string; httpStatus?: number }

export interface ResearchEntryContext {
  id: string
  source: SourceProviderId
  heading: string
  text: string
  sectionHeadings: string[]
  evidenceScopeId: string
  sourceUrl: string
  entryKind: 'lemma' | 'form' | 'unresolved'
  formOf?: LexemeRef
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
  sources?: SourceRecord[]
  lexeme?: LexemeRef
  etymonlineData: SourceData | null
  wiktionaryData: SourceData | null
  relatedTerms: string[]
  relationship?: 'component' | 'root' | 'spelling-variant' | 'redirect'
  parentHistoryId?: string
  variantOf?: LexemeRef
  relationshipSourceUrl?: string
  evidenceScopeId?: string
  wiktionaryEnglish?: SourceData | null
  wiktionaryNative?: SourceData | null
}

/**
 * Research data for a related term, retained as peripheral evidence.
 */
export interface RelatedTermResearchData {
  term: string
  sources?: SourceRecord[]
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
    sources?: SourceRecord[]
    etymonline: SourceData | null
    wiktionary: SourceData | null
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
  incompleteResearch?: boolean
  sourceOutcomes?: Array<{ lexeme: LexemeRef; source: string; outcome: SourceOutcome }>
  parsedChains?: ParsedEtymChain[] // pre-parsed etymology chains from source text
  entryContexts?: ResearchEntryContext[]
  lexicalGraph?: LexicalResearchGraph
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
  | { type: 'source_outcome'; source: string; outcome: SourceOutcome; timing?: number }
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
