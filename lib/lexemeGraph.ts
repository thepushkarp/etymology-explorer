import type { ParsedEtymChain, ParsedEtymLink } from './etymologyParser'
import type {
  LexicalEdge,
  LexicalRelation,
  LexicalResearchGraph,
  ResearchEntryContext,
} from './types'

function normalizeLexeme(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}

function idPart(value: string): string {
  return encodeURIComponent(normalizeLexeme(value)).replace(/%/g, '_')
}

function relationFromEvidence(link: ParsedEtymLink): LexicalRelation {
  if (/\bborrow(?:ed|ing)?\b/i.test(link.rawSnippet)) return 'borrowed_from'
  if (/\binherit(?:ed|ance)?\b/i.test(link.rawSnippet)) return 'inherited_from'
  if (/\bcalque(?:d)?\b/i.test(link.rawSnippet)) return 'calqued_from'
  if (/\bcompound(?:ed)?\b/i.test(link.rawSnippet)) return 'compound_from'
  return 'derived_from'
}

function edgeRole(relation: LexicalRelation): LexicalEdge['role'] {
  if (relation === 'form_of' || relation === 'variant_of') return 'morphology'
  if (relation === 'semantic_extension_of') return 'semantics'
  if (relation === 'cognate_with') return 'context'
  return 'ancestry'
}

function createsAncestryCycle(
  edges: Record<string, LexicalEdge>,
  from: string,
  to: string
): boolean {
  const pending = [to]
  const visited = new Set<string>()

  while (pending.length > 0) {
    const current = pending.pop()
    if (!current || visited.has(current)) continue
    if (current === from) return true
    visited.add(current)
    for (const edge of Object.values(edges)) {
      if (edge.role === 'ancestry' && edge.from === current) pending.push(edge.to)
    }
  }
  return false
}

/**
 * Builds a source-backed graph without asking the model to create identity or
 * chronology. Every history owns an evidence scope, so identical forms in an
 * adjacent homograph cannot corroborate one another during enrichment.
 */
export function buildLexicalResearchGraph(
  word: string,
  language: string,
  contexts: ResearchEntryContext[],
  chains: ParsedEtymChain[]
): LexicalResearchGraph {
  const graph: LexicalResearchGraph = {
    nodes: {},
    edges: {},
    evidence: {},
    histories: [],
  }

  for (const context of contexts) {
    const queryNodeId = `query:${context.id}`
    graph.nodes[queryNodeId] = {
      id: queryNodeId,
      kind: context.entryKind === 'form' ? 'form' : 'lexeme',
      lexeme: { language, lemma: word, normalizedLemma: normalizeLexeme(word) },
      displayForm: word,
      senseIds: [],
    }

    const historyChains = chains.filter((chain) => chain.historyId === context.id)
    const nodeIds = [queryNodeId]
    const edgeIds: string[] = []
    let lemmaNodeId = queryNodeId

    if (context.formOf) {
      lemmaNodeId = `lemma:${context.id}:${idPart(context.formOf.language)}:${idPart(context.formOf.word)}`
      graph.nodes[lemmaNodeId] = {
        id: lemmaNodeId,
        kind: 'lexeme',
        lexeme: {
          language: context.formOf.language,
          lemma: context.formOf.word,
          normalizedLemma: normalizeLexeme(context.formOf.word),
        },
        displayForm: context.formOf.word,
        senseIds: [],
      }
      nodeIds.push(lemmaNodeId)
      const edgeId = `edge:${context.id}:form-of`
      graph.edges[edgeId] = {
        id: edgeId,
        from: queryNodeId,
        to: lemmaNodeId,
        relation: 'form_of',
        role: 'morphology',
        evidenceIds: [],
        confidence: 'medium',
      }
      edgeIds.push(edgeId)
    }

    for (const [chainIndex, chain] of historyChains.entries()) {
      let youngerNodeId = queryNodeId
      for (const [linkIndex, link] of chain.links.entries()) {
        const olderNodeId = `etymon:${context.id}:${idPart(link.language)}:${idPart(link.form)}`
        if (!graph.nodes[olderNodeId]) {
          graph.nodes[olderNodeId] = {
            id: olderNodeId,
            kind: 'etymon',
            lexeme: {
              language: link.language,
              lemma: link.form,
              normalizedLemma: normalizeLexeme(link.form),
            },
            displayForm: link.form,
            isReconstructed: link.isReconstructed,
            senseIds: [],
          }
          nodeIds.push(olderNodeId)
        }

        const relation = relationFromEvidence(link)
        const evidenceId = `evidence:${context.id}:${chainIndex}:${linkIndex}`
        graph.evidence[evidenceId] = {
          id: evidenceId,
          provider: chain.provider ?? chain.source,
          sourceFamily: 'wiktionary',
          sourceUrl: context.sourceUrl,
          evidenceScopeId: context.evidenceScopeId,
          subjectKind: 'edge',
          snippet: link.rawSnippet,
        }

        const edgeId = `edge:${context.id}:${chainIndex}:${linkIndex}`
        if (!createsAncestryCycle(graph.edges, youngerNodeId, olderNodeId)) {
          graph.edges[edgeId] = {
            id: edgeId,
            from: youngerNodeId,
            to: olderNodeId,
            relation,
            role: edgeRole(relation),
            evidenceIds: [evidenceId],
            confidence: 'medium',
          }
          edgeIds.push(edgeId)
        }
        youngerNodeId = olderNodeId
      }
    }

    graph.histories.push({
      id: context.id,
      entryKind: context.entryKind,
      queryNodeId,
      lemmaNodeId,
      formOf: context.formOf,
      nodeIds,
      edgeIds,
      evidenceScopeIds: [context.evidenceScopeId],
    })
  }

  return graph
}

export function hasAncestryCycle(graph: LexicalResearchGraph): boolean {
  return Object.values(graph.edges).some(
    (edge) => edge.role === 'ancestry' && createsAncestryCycle(graph.edges, edge.from, edge.to)
  )
}
