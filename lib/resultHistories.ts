import { canonicalizeWord } from './orthography'
import type { EtymologyEntry, EtymologyResult, LexicalHistory } from './types'

export interface HistoryChoice {
  id: string
  label: string
  entryKind: 'lemma' | 'form' | 'unresolved'
  formOf?: { word: string; language: string }
  partsOfSpeech: string[]
}

/**
 * Project a result onto one of its histories: the selected history, else the
 * primary, else the first. Sources follow the selected history's research
 * ownership and visible forms; entry-wide usage and suggestions remain shared.
 */
export function historyEntry(result: EtymologyResult, historyId?: string): EtymologyEntry {
  const { histories, primaryHistoryId, ...entry } = result
  const history =
    histories.find((candidate) => candidate.id === historyId) ??
    histories.find((candidate) => candidate.id === primaryHistoryId) ??
    histories[0]
  if (!history) return entry
  return {
    ...entry,
    sources: sourcesForHistory(result, history),
    stratum: history.stratum,
    pronunciation: history.pronunciation,
    transliteration: history.transliteration,
    counterparts: history.counterparts,
    definition: history.definition,
    roots: history.roots,
    ancestryGraph: history.ancestryGraph,
    lore: history.lore,
    examples: history.examples,
    partsOfSpeech: history.partsOfSpeech,
  }
}

function sourcesForHistory(result: EtymologyResult, history: LexicalHistory) {
  const graph = history.ancestryGraph
  const stages = [...graph.branches.flatMap((branch) => branch.stages), ...(graph.postMerge ?? [])]
  const forms = new Set(
    [
      result.word,
      history.formOf?.word,
      graph.mergePoint?.form,
      ...history.roots.map((root) => root.root),
      ...stages.map((stage) => stage.form),
    ]
      .filter((form): form is string => Boolean(form))
      .map(canonicalizeWord)
  )
  const evidence = stages.flatMap((stage) => stage.evidence ?? [])
  return result.sources.filter((source) => {
    if (source.historyIds) return source.historyIds.includes(history.id)
    // Saved entries without ownership metadata can still be scoped to the
    // displayed forms. Matching a shared dictionary URL alone is insufficient.
    if (source.word) return forms.has(canonicalizeWord(source.word))
    return (
      source.name === 'synthesized' ||
      evidence.some((item) => item.source === source.name && item.sourceUrl === source.url) ||
      result.histories.length === 1
    )
  })
}

export function historyChoices(result: EtymologyResult): HistoryChoice[] {
  return result.histories.map((history) => ({
    id: history.id,
    label: history.label,
    entryKind: history.entryKind,
    formOf: history.formOf,
    partsOfSpeech: Array.from(new Set((history.partsOfSpeech ?? []).map((part) => part.pos))),
  }))
}
