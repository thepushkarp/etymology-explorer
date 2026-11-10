/**
 * Builds a valid EtymologyResult from entry fields, the way synthesis
 * projects its primary history to the top level. Given research, it emits one
 * history per source-defined candidate with that candidate's identity, so
 * finalizeResult accepts it; otherwise it emits a single synthetic history.
 * Only imported from *.test.ts files.
 */

import type { EtymologyEntry, EtymologyResult, LexicalHistory, ResearchContext } from '@/lib/types'

type FixtureEntry = Pick<EtymologyEntry, 'word'> &
  Partial<Omit<EtymologyEntry, 'word'>> &
  Partial<Pick<EtymologyResult, 'primaryHistoryId' | 'histories'>>

export function etymologyResult(fields: FixtureEntry, research?: ResearchContext): EtymologyResult {
  const entry = {
    language: research?.language ?? ('en' as const),
    pronunciation: '',
    definition: '',
    roots: [],
    ancestryGraph: { branches: [] },
    lore: '',
    sources: [],
    ...fields,
  }
  const scope = `${entry.language}:${encodeURIComponent(entry.word)}:1`
  const candidates = research?.lexicalGraph?.histories ?? [
    {
      id: `history:${scope}`,
      entryKind: 'lemma' as const,
      queryNodeId: `query:history:${scope}`,
      lemmaNodeId: `query:history:${scope}`,
      evidenceScopeIds: [`scope:${scope}`],
    },
  ]
  const histories: LexicalHistory[] = candidates.map((candidate) => ({
    id: candidate.id,
    label: entry.definition || entry.word,
    entryKind: candidate.entryKind,
    queryNodeId: candidate.queryNodeId,
    lemmaNodeId: candidate.lemmaNodeId,
    ...('formOf' in candidate && candidate.formOf ? { formOf: candidate.formOf } : {}),
    evidenceScopeIds: candidate.evidenceScopeIds,
    pronunciation: entry.pronunciation,
    definition: entry.definition,
    roots: structuredClone(entry.roots),
    ancestryGraph: structuredClone(entry.ancestryGraph),
    lore: entry.lore,
    ...(entry.examples ? { examples: entry.examples } : {}),
    ...(entry.partsOfSpeech ? { partsOfSpeech: entry.partsOfSpeech } : {}),
  }))
  return { primaryHistoryId: histories[0].id, histories, ...entry }
}
