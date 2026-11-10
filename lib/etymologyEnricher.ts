/**
 * Post-processes the LLM's ancestry graph by matching stages against
 * pre-parsed etymology chains from source text.
 *
 * Assigns confidence levels and attaches source evidence to each stage.
 * The LLM does NOT self-assess confidence — we determine it programmatically.
 */

import type { AncestryGraph, AncestryStage, StageConfidence, StageEvidence } from './types'
import {
  isReconstructedForm,
  normalizeLanguageName,
  type ParsedEtymChain,
  type ParsedEtymLink,
} from './etymologyParser'
import { canonicalizeWord } from './orthography'
import { sourceFamily, type SourceProviderId, type SourceFamilyId } from './sourceProviders'

/** Parenthetical glosses are annotations; every character in the form is significant. */
function normalize(s: string): string {
  return canonicalizeWord(s.replace(/\s+\([^)]*\)$/, ''))
}

const BROAD_LANGUAGE: Record<string, string> = {
  'classical latin': 'latin',
  'medieval latin': 'latin',
  'late latin': 'latin',
  'vulgar latin': 'latin',
  'new latin': 'latin',
  'church latin': 'latin',
  'ancient greek': 'greek',
  'koine greek': 'greek',
  'old english': 'english',
  'middle english': 'english',
  'modern english': 'english',
  'old french': 'french',
  'middle french': 'french',
  'modern french': 'french',
  'anglo-french': 'french',
  'old high german': 'german',
  'middle dutch': 'dutch',
  'vedic sanskrit': 'sanskrit',
  'classical sanskrit': 'sanskrit',
  'classical persian': 'persian',
  'middle persian': 'persian',
  'old persian': 'persian',
}

function compatibleLanguage(left: string, right: string): boolean {
  const normalizedLeft = canonicalizeWord(normalizeLanguageName(left))
  const normalizedRight = canonicalizeWord(normalizeLanguageName(right))
  return (
    normalizedLeft === normalizedRight ||
    BROAD_LANGUAGE[normalizedLeft] === normalizedRight ||
    BROAD_LANGUAGE[normalizedRight] === normalizedLeft
  )
}

interface MatchResult {
  link: ParsedEtymLink
  source: SourceProviderId
  family: SourceFamilyId
  sourceUrl?: string
  evidenceScopeId?: string
}

/** Match within the caller's history scope and an explicitly identified language. */
function findMatches(stage: AncestryStage, chains: ParsedEtymChain[]): MatchResult[] {
  const matches: MatchResult[] = []

  for (const chain of chains) {
    for (const link of chain.links) {
      if (
        typeof stage.form === 'string' &&
        typeof stage.stage === 'string' &&
        compatibleLanguage(stage.stage, link.language) &&
        stage.isReconstructed === link.isReconstructed &&
        [link.form, ...(link.variants ?? [])].some(
          (form) => normalize(stage.form) === normalize(form)
        )
      ) {
        const provider = chain.provider ?? chain.source
        matches.push({
          link,
          source: provider,
          family: chain.sourceFamily ?? sourceFamily(provider),
          sourceUrl: chain.sourceUrl,
          evidenceScopeId: chain.evidenceScopeId,
        })
      }
    }
  }

  return matches
}

/**
 * Determine confidence from the number of distinct sources that attest a stage.
 */
function determineConfidence(matches: MatchResult[]): StageConfidence {
  const families = new Set(matches.map((match) => match.family))
  if (families.size >= 2) return 'high'
  if (families.size === 1) return 'medium'
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
      sourceFamily: match.family,
      ...(match.sourceUrl ? { sourceUrl: match.sourceUrl } : {}),
      ...(match.evidenceScopeId ? { evidenceScopeId: match.evidenceScopeId } : {}),
    })
  }

  return evidence
}

/**
 * Enrich a single AncestryStage with confidence and evidence.
 * Mutates the stage in-place for efficiency.
 */
function enrichStage(stage: AncestryStage, chains: ParsedEtymChain[]): void {
  stage.isReconstructed = isReconstructedForm(stage.form, stage.stage)

  // Find matching parsed links
  const matches = findMatches(stage, chains)

  // Assign confidence
  stage.confidence = determineConfidence(matches)

  // Model-supplied evidence must never survive an unsuccessful source match.
  stage.evidence = buildEvidence(matches)

  // A reading belongs to the exact written form; variant spellings cannot lend
  // their reading, and conflicting source readings cannot select one for us.
  const readings = new Set(
    matches
      .filter((match) => normalize(stage.form) === normalize(match.link.form))
      .map((match) => match.link.transliteration)
      .filter((reading): reading is string => Boolean(reading))
  )
  if (readings.size === 1) stage.transliteration = [...readings][0]
  else delete stage.transliteration
}

/**
 * Enrich the entire ancestry graph with source evidence and confidence levels.
 * Mutates the graph in-place.
 *
 * Call this AFTER the LLM returns its response, BEFORE sending to the client.
 */
export function enrichAncestryGraph(graph: AncestryGraph, parsedChains: ParsedEtymChain[]): void {
  if (!graph?.branches) return

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

/**
 * Remove reconstructed stages (PIE, Proto-*) that have no source evidence.
 * Returns count of pruned stages for observability.
 *
 * Only targets isReconstructed + confidence === 'low' stages.
 * Non-reconstructed low-confidence stages are kept — they may be
 * real forms the parser's regex missed (e.g., variant Latin spellings).
 *
 * Must be called after enrichAncestryGraph() — relies on isReconstructed
 * and confidence fields set by that function.
 */
export function pruneUngroundedStages(graph: AncestryGraph): number {
  if (!graph?.branches) return 0
  let pruned = 0

  const isUngrounded = (s: AncestryStage) => s.isReconstructed && s.confidence === 'low'

  for (const branch of graph.branches) {
    const before = branch.stages.length
    branch.stages = branch.stages.filter((s) => !isUngrounded(s))
    pruned += before - branch.stages.length
  }

  if (graph.postMerge) {
    const before = graph.postMerge.length
    graph.postMerge = graph.postMerge.filter((s) => !isUngrounded(s))
    pruned += before - graph.postMerge.length
  }

  // Track which original indices survive so convergencePoints can be remapped
  const keptOriginalIndices: number[] = []
  const filteredBranches = graph.branches.filter((b, i) => {
    if (b.stages.length > 0) {
      keptOriginalIndices.push(i)
      return true
    }
    return false
  })
  graph.branches = filteredBranches

  // Remap convergencePoints.branchIndices and prune ungrounded pieRoots
  if (graph.convergencePoints) {
    const indexRemap = new Map(keptOriginalIndices.map((old, newIdx) => [old, newIdx]))

    // Collect all surviving reconstructed forms for validation
    const attestedForms = new Set<string>()
    for (const branch of graph.branches) {
      for (const stage of branch.stages) {
        if (stage.isReconstructed && typeof stage.form === 'string') {
          attestedForms.add(normalize(stage.form))
        }
      }
    }

    // pieRoot comes from unvalidated LLM output — drop malformed entries
    graph.convergencePoints = graph.convergencePoints
      .filter((cp) => typeof cp.pieRoot === 'string' && attestedForms.has(normalize(cp.pieRoot)))
      .map((cp) => ({
        ...cp,
        branchIndices: cp.branchIndices
          .filter((i) => indexRemap.has(i))
          .map((i) => indexRemap.get(i)!),
      }))
      .filter((cp) => cp.branchIndices.length >= 2)
  }

  // Pruned component roots cannot leave a merge floating above a supported
  // whole-word chain. Keep that surviving lineage as an ordinary single branch.
  if (graph.branches.length === 0 && graph.postMerge?.length) {
    graph.branches = [{ root: graph.postMerge[0].form, stages: graph.postMerge }]
    delete graph.mergePoint
    delete graph.postMerge
  }

  return pruned
}
