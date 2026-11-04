import { LANGUAGES } from './languages'
import { sourceEvidenceRole } from './researchSources'
import type { SourceRecord } from './types'

function isEtymologyHeading(heading: string): boolean {
  return Object.values(LANGUAGES).some((language) => language.etymologyHeading.test(heading))
}

/**
 * Keep each publisher's complete etymology passage visible beside its entry
 * identity. These accounts have no cross-publisher history alignment: the
 * source's definitions, language, and forms must establish a shared sense.
 */
export function sourceEtymologyAccounts(sources: SourceRecord[]) {
  return sources.flatMap((source) => {
    if (sourceEvidenceRole(source) !== 'etymology') return []
    return (source.data.entryGroups ?? []).flatMap((group) => {
      const passages = group.sections
        .filter((section) => isEtymologyHeading(section.heading))
        .map((section) => ({
          heading: section.heading,
          anchor: section.anchor,
          text: section.text,
        }))
      if (isEtymologyHeading(group.heading)) {
        // Wiktionary puts the etymology before its definition/POS subsections.
        // A subsection's first occurrence marks its source-defined boundary.
        const firstSection = Math.min(
          ...group.sections
            .map((section) => group.text.indexOf(section.text))
            .filter((offset) => offset >= 0),
          group.text.length
        )
        const text = group.text.slice(0, firstSection).trim()
        if (text) passages.unshift({ heading: group.heading, anchor: group.anchor, text })
      }
      if (!passages.length) return []
      return [
        {
          provider: source.provider,
          sourceFamily: source.sourceFamily,
          lexicalLanguage: source.data.lexicalLanguage ?? source.data.language,
          requestedWord: source.data.requestedWord,
          resolvedWord: source.data.resolvedWord,
          sourceUrl: group.sourceUrl ?? source.data.url,
          entryAnchor: group.anchor,
          entryHeading: group.heading,
          passages,
        },
      ]
    })
  })
}
