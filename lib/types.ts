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
 * A source reference with name and URL
 */
export interface SourceReference {
  name: 'etymonline' | 'wiktionary' | 'synthesized'
  url?: string // URL of the actual page used (undefined for 'synthesized')
}

/**
 * Complete etymology result for a word
 */
export interface EtymologyResult {
  word: string
  pronunciation: string // IPA, e.g., "/pərˈfɪdiəs/"
  definition: string // Brief definition
  roots: Root[] // 1 to many roots depending on word composition
  lore: string // 4-6 sentence rich etymology narrative with ancestry context
  sources: SourceReference[]
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
  }
  identifiedRoots: string[]
  rootResearch: RootResearchData[]
  relatedWordsData: Record<string, SourceData>
  totalSourcesFetched: number
}
