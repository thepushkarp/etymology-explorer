import type { EtymologyEntry, EtymologyResult } from './types'

export interface HistoryChoice {
  id: string
  label: string
  entryKind: 'lemma' | 'form' | 'unresolved'
  formOf?: { word: string; language: string }
  partsOfSpeech: string[]
}

/**
 * Project a result onto one of its histories: the selected history, else the
 * primary, else the first. The entry-wide fields (sources, suggestions,
 * modern usage, usage data) are shared by every history.
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
    pronunciation: history.pronunciation,
    definition: history.definition,
    roots: history.roots,
    ancestryGraph: history.ancestryGraph,
    lore: history.lore,
    examples: history.examples,
    partsOfSpeech: history.partsOfSpeech,
  }
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
