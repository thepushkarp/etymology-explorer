import { sourceFamily, type SourceProviderId } from './sourceProviders'
import type {
  ResearchContext,
  RelatedTermResearchData,
  RootResearchData,
  SourceData,
  SourceRecord,
} from './types'

/** Old research recordings predate source collections and remain replayable. */
function recordedSources(
  entries: ReadonlyArray<readonly [SourceProviderId, SourceData | null | undefined]>
): SourceRecord[] {
  return entries.flatMap(([provider, data]) =>
    data ? [{ provider, sourceFamily: data.sourceFamily ?? sourceFamily(provider), data }] : []
  )
}

export function mainSourceRecords(main: ResearchContext['mainWord']): SourceRecord[] {
  return (
    main.sources ??
    recordedSources([
      ['etymonline', main.etymonline],
      ['wiktionary', main.wiktionary],
      ['wiktionaryEnglish', main.wiktionaryEnglish],
      ['wiktionaryNative', main.wiktionaryNative],
      ['wikidataLexeme', main.wikidataLexeme],
      ['multilingualDictionary', main.multilingualDictionary],
      ['dicionarioAberto', main.dicionarioAberto],
      ['wikipedia', main.wikipedia],
      ['incelsWiki', main.incelsWiki],
    ])
  )
}

export function rootSourceRecords(root: RootResearchData): SourceRecord[] {
  return (
    root.sources ??
    recordedSources([
      ['etymonline', root.etymonlineData],
      ['wiktionary', root.wiktionaryData],
      ['wiktionaryEnglish', root.wiktionaryEnglish],
      ['wiktionaryNative', root.wiktionaryNative],
    ])
  )
}

export function relatedSourceRecords(related: RelatedTermResearchData): SourceRecord[] {
  return related.sources ?? recordedSources([['etymonline', related.etymonlineData]])
}

export function sourceEvidenceRole(record: SourceRecord): 'etymology' | 'lexical' | 'context' {
  if (record.provider === 'wikipedia' || record.provider === 'incelsWiki') return 'context'
  if (record.provider === 'multilingualDictionary' || record.provider === 'wikidataLexeme') {
    return 'lexical'
  }
  return record.evidenceRole ?? record.data.evidenceRole ?? 'etymology'
}

/** Lexical dictionaries can attest forms even when they state no derivation. */
export function lexicalSourceRecords(records: SourceRecord[]): SourceRecord[] {
  return records.filter((record) => sourceEvidenceRole(record) !== 'context')
}
