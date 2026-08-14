import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LearnerEtymologyResult } from '@/lib/types'
import { JapaneseEntryCard } from './JapaneseEntryCard'

const result: LearnerEtymologyResult = {
  language: 'ja',
  word: '食べる',
  entryId: '1358280',
  reading: 'たべる',
  romaji: 'taberu',
  alternateForms: [],
  pronunciation: 'たべる',
  definition: 'to eat',
  lexicalStratum: 'native',
  evidenceState: 'lexical_only',
  formation: {
    kind: 'opaque',
    parts: [{ form: '食べる', reading: 'たべる', meaning: 'to eat', role: 'whole' }],
    result: '食べる',
    note: 'The available sources do not support a reliable internal breakdown.',
  },
  originSummary: 'Reliable origin evidence was not found in the available sources.',
  roots: [],
  ancestryGraph: { branches: [] },
  lore: 'The evidence gap remains visible.',
  sources: [
    {
      name: 'jmdict',
      url: 'https://www.edrdg.org/',
      license: 'CC BY-SA 4.0',
      licenseUrl: '/licenses/JMdict.md',
    },
  ],
}

describe('Japanese annotated-headword folio', () => {
  test('renders semantic ruby, a transient romaji control, and the searched inflection map', () => {
    const markup = renderToStaticMarkup(
      <JapaneseEntryCard
        result={result}
        searchedQuery="食べました"
        matchExplanation="polite past form"
      />
    )
    expect(markup).toContain('<ruby>食べる')
    expect(markup).toContain('<rt')
    expect(markup).toContain('たべる</rt>')
    expect(markup).toContain('Show romaji')
    expect(markup).not.toContain('>taberu<')
    expect(markup).toContain('食べました')
    expect(markup).toContain('dictionary form')
    expect(markup).not.toContain('Usage over time')
  })
})
