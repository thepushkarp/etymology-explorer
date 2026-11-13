import index from '../data/oncoj-index.json'
import type { SourceData, SourceLexicalRelation } from './types'
import type { WiktionaryEntryGroup } from './wiktionaryEntryGroups'

interface AnnotationEntry {
  id: string
  forms: string[]
  derivations: { targetId: string; form: string }[]
}
interface AnnotationRecord {
  id: string
  entries: AnnotationEntry[]
  xml: string
}
const records: AnnotationRecord[] = index.records
const byForm = new Map<string, AnnotationRecord[]>()
const byId = new Map<string, AnnotationEntry>()
for (const record of records) {
  for (const entry of record.entries) {
    byId.set(entry.id, entry)
    for (const form of entry.forms) {
      const matching = byForm.get(form) ?? []
      if (!matching.includes(record)) matching.push(record)
      byForm.set(form, matching)
    }
  }
}

/** Frellesvig–Whitman transcription is exact: pi/pwi and ko/kwo must remain distinct. */
export function lookupOncoj(word: string, language = 'Old Japanese'): SourceData | null {
  if (language !== 'Old Japanese') return null
  const matches = byForm.get(word.normalize('NFC'))
  if (!matches?.length) return null
  const url = `https://github.com/ONCOJ/data/blob/${index.revision}/lexicon.xml`
  const groups: WiktionaryEntryGroup[] = []
  for (const record of matches)
    for (const entry of record.entries) {
      if (!entry.forms.includes(word)) continue
      const relations: SourceLexicalRelation[] = entry.derivations.flatMap((relation) => {
        if (!byId.get(relation.targetId)?.forms.includes(relation.form)) return []
        return [
          {
            subject: { word, language: 'Old Japanese' },
            target: { word: relation.form, language: 'Old Japanese' },
            relation: 'derived_from' as const,
            snippet: `ONCOJ ${entry.id}: ${word} derives from ${relation.form} (${relation.targetId}).`,
          },
        ]
      })
      groups.push({
        index: entry.id,
        number: entry.id,
        heading: `${word} (${entry.id})`,
        anchor: entry.id,
        level: 3,
        text: record.xml,
        sections: [],
        sourceUrl: url,
        relations,
        etymologyText: relations.map((relation) => relation.snippet).join('\n'),
      })
    }
  return {
    text: `${index.attribution}\n${index.license}\nFrellesvig–Whitman transcription; Old Japanese only.\n\n${matches.map((record) => record.xml).join('\n\n')}`,
    url,
    requestedWord: word,
    resolvedWord: word,
    lexicalLanguage: 'Old Japanese',
    sourceFamily: 'oncoj',
    sourceEntryId: matches.map((record) => record.id).join('|'),
    revisionId: index.revision,
    license: `${index.license}; https://creativecommons.org/licenses/by/4.0/; ${index.attribution}`,
    evidenceRole: 'etymology',
    entryGroups: groups,
  }
}
