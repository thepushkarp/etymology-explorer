/**
 * Post-processes the LLM's ancestry graph by matching stages against
 * pre-parsed etymology chains from source text.
 *
 * Assigns confidence levels and attaches source evidence to each stage.
 * The LLM does NOT self-assess confidence — we determine it programmatically.
 */

import type { AncestryGraph, AncestryStage, StageConfidence, StageEvidence } from './types'
import type { ParsedEtymChain, ParsedEtymLink } from './etymologyParser'

/**
 * Normalize a string for fuzzy matching:
 * - lowercase
 * - strip diacritics/macrons
 * - strip parenthetical annotations like "(τῆλε)"
 * - strip leading * (reconstructed marker)
 * - collapse whitespace
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/\([^)]*\)/g, '') // strip parentheticals
    .replace(/^\*+/, '') // strip leading asterisks
    .replace(/[-_]/g, '') // strip hyphens/underscores
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Check if two normalized strings are a fuzzy match.
 * Uses substring containment in both directions.
 */
function isFuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false

  // Exact match
  if (na === nb) return true

  // Substring containment (either direction)
  if (na.length >= 3 && nb.includes(na)) return true
  if (nb.length >= 3 && na.includes(nb)) return true

  return false
}

/**
 * Check if a language name from a stage matches a parsed link's language.
 * Handles variations like "Latin" matching "Late Latin", "Vulgar Latin", etc.
 */
function isLanguageMatch(stageLanguage: string, linkLanguage: string): boolean {
  const sNorm = stageLanguage.toLowerCase()
  const lNorm = linkLanguage.toLowerCase()

  if (sNorm === lNorm) return true

  // "Latin" should match "Late Latin", "Vulgar Latin", etc.
  if (lNorm.includes(sNorm) || sNorm.includes(lNorm)) return true

  return false
}

interface MatchResult {
  link: ParsedEtymLink
  source: 'etymonline' | 'wiktionary'
}

/**
 * Find all parsed links that match a given ancestry stage.
 * Matches by form (fuzzy) AND/OR language name.
 */
function findMatches(stage: AncestryStage, chains: ParsedEtymChain[]): MatchResult[] {
  const matches: MatchResult[] = []

  for (const chain of chains) {
    for (const link of chain.links) {
      const formMatch = isFuzzyMatch(stage.form, link.form)
      const langMatch = isLanguageMatch(stage.stage, link.language)

      // Require form match, or both language match + non-trivial overlap
      if (
        formMatch ||
        (langMatch && stage.form && link.form && isFuzzyMatch(stage.form, link.form))
      ) {
        matches.push({ link, source: chain.source })
      }
    }
  }

  return matches
}

/**
 * Determine confidence from the number of distinct sources that attest a stage.
 */
function determineConfidence(matches: MatchResult[]): StageConfidence {
  const sources = new Set(matches.map((m) => m.source))
  if (sources.size >= 2) return 'high'
  if (sources.size === 1) return 'medium'
  return 'low'
}

/**
 * Build evidence entries from matches, capped at one per source.
 */
function buildEvidence(matches: MatchResult[]): StageEvidence[] {
  const seen = new Set<string>()
  const evidence: StageEvidence[] = []

  for (const match of matches) {
    if (seen.has(match.source)) continue
    seen.add(match.source)
    evidence.push({
      source: match.source,
      snippet: match.link.rawSnippet,
    })
  }

  return evidence
}

/**
 * Check if a stage represents a reconstructed form (PIE, Proto-*)
 */
function isReconstructedStage(stage: AncestryStage): boolean {
  if (stage.form.startsWith('*')) return true
  const lower = stage.stage.toLowerCase()
  if (lower.includes('proto-indo-european') || lower === 'pie') return true
  if (lower.startsWith('proto-')) return true
  return false
}

/**
 * Enrich a single AncestryStage with confidence and evidence.
 * Mutates the stage in-place for efficiency.
 */
function enrichStage(stage: AncestryStage, chains: ParsedEtymChain[]): void {
  // Set reconstructed flag
  stage.isReconstructed = isReconstructedStage(stage)

  // Find matching parsed links
  const matches = findMatches(stage, chains)

  // Assign confidence
  stage.confidence = determineConfidence(matches)

  // Attach evidence
  if (matches.length > 0) {
    stage.evidence = buildEvidence(matches)
  }
}

/**
 * Enrich the entire ancestry graph with source evidence and confidence levels.
 * Mutates the graph in-place.
 *
 * Call this AFTER the LLM returns its response, BEFORE sending to the client.
 */
export function enrichAncestryGraph(graph: AncestryGraph, parsedChains: ParsedEtymChain[]): void {
  if (!graph || !parsedChains.length) return

  // Enrich each branch's stages
  for (const branch of graph.branches) {
    for (const stage of branch.stages) {
      enrichStage(stage, parsedChains)
    }
  }

  // Enrich post-merge stages if present
  if (graph.postMerge) {
    for (const stage of graph.postMerge) {
      enrichStage(stage, parsedChains)
    }
  }
}
