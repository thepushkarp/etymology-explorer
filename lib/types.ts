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
  name: 'etymonline' | 'wiktionary' | 'synthesized'
  url?: string // URL of the actual page used (undefined for 'synthesized')
  word?: string // The specific word/root that was looked up (undefined for 'synthesized')
}

/**
 * A stage in a single branch of the word's etymological ancestry
 */
export interface AncestryStage {
  stage: string // Language/period: "Proto-Indo-European", "Greek", "Latin", etc.
  form: string // The word form at this stage
  note: string // Brief annotation about meaning/context at this stage
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

/**
 * Complete etymology result for a word
 */
export interface EtymologyResult {
  word: string
  pronunciation: string // IPA, e.g., "/pərˈfɪdiəs/"
  definition: string // Brief definition
  roots: Root[] // 1 to many roots depending on word composition
  ancestryGraph: AncestryGraph // Graph showing how roots evolved and merged
  lore: string // 4-6 sentence revelationary narrative with "aha" moments
  sources: SourceReference[]
  partsOfSpeech?: POSDefinition[] // Definitions per grammatical category
  suggestions?: WordSuggestions // Related words for vocabulary building
  modernUsage?: ModernUsage // Contemporary/slang meanings
}

/**
 * API request body for /api/etymology
 */
export interface EtymologyRequest {
  word: string
  llmConfig: LLMConfig
}

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
  timestamp: number
}

/**
 * LLM provider type
 */
export type LLMProvider = 'anthropic' | 'openrouter'

/**
 * LLM configuration for API calls
 */
export interface LLMConfig {
  provider: LLMProvider
  anthropicApiKey: string
  anthropicModel: string // Dynamic model ID from API
  openrouterApiKey: string
  openrouterModel: string // User-specified model like "anthropic/claude-3.5-sonnet"
}

/**
 * Anthropic model info from the models API
 */
export interface AnthropicModelInfo {
  id: string
  displayName: string
}

/**
 * Raw data fetched from a single external source
 */
export interface SourceData {
  text: string
  url: string
}

/**
 * Raw data fetched from external sources before Claude synthesis
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
  etymonlineData: SourceData | null
  wiktionaryData: SourceData | null
  relatedTerms: string[]
}

/**
 * Aggregated research context from agentic exploration
 */
export interface ResearchContext {
  mainWord: {
    word: string
    etymonline: SourceData | null
    wiktionary: SourceData | null
    wikipedia?: SourceData | null
    urbanDictionary?: SourceData | null
  }
  identifiedRoots: string[]
  rootResearch: RootResearchData[]
  relatedWordsData: Record<string, SourceData>
  totalSourcesFetched: number
}
