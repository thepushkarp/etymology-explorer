/**
 * A single etymological root component of a word
 */
export interface Root {
  root: string // e.g., "fides"
  origin: string // e.g., "Latin"
  meaning: string // e.g., "faith, trust"
  relatedWords: string[] // e.g., ["fidelity", "confide", "diffident"]
}

/**
 * Complete etymology result for a word
 */
export interface EtymologyResult {
  word: string
  pronunciation: string // IPA, e.g., "/pərˈfɪdiəs/"
  definition: string // Brief definition
  roots: Root[]
  lore: string // 2-3 sentence memorable narrative
  sources: ('etymonline' | 'wiktionary' | 'synthesized')[]
}

/**
 * API request body for /api/etymology
 */
export interface EtymologyRequest {
  word: string
  apiKey: string
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
 * Raw data fetched from external sources before Claude synthesis
 */
export interface RawSourceData {
  etymonline?: string | null
  wiktionary?: string | null
}
