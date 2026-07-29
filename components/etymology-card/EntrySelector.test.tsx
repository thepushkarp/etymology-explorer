import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EntrySelector } from './EntrySelector'

const entries = [
  { id: 'vine', label: 'vine; screw', entryKind: 'lemma' as const, partsOfSpeech: ['noun'] },
  {
    id: 'lives',
    label: 'plural of vita',
    entryKind: 'form' as const,
    formOf: { word: 'vita', language: 'it' },
    partsOfSpeech: ['noun'],
  },
]

describe('EntrySelector', () => {
  test('omits the ledger for a single history', () => {
    expect(
      renderToStaticMarkup(
        <EntrySelector
          word="vite"
          entries={entries.slice(0, 1)}
          activeEntryId="vine"
          onChange={() => {}}
        />
      )
    ).toBe('')
  })

  test('renders an accessible, selected history ledger', () => {
    const markup = renderToStaticMarkup(
      <EntrySelector word="vite" entries={entries} activeEntryId="lives" onChange={() => {}} />
    )
    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('Choose an etymology for vite')
    expect(markup).toContain('History 2 of 2, form of vita, plural of vita')
    expect(markup).toContain('aria-selected="true"')
  })
})
