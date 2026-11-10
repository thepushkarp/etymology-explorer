import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EntryView } from './EntryView'
import { etymologyResult } from '@/lib/testSupport/etymologyResult'
import type { WordEntry } from '@/lib/types'

const entry: WordEntry = {
  word: 'sale',
  languages: ['en', 'it'],
  entries: {
    en: etymologyResult({ word: 'sale', language: 'en', definition: 'The act of selling.' }),
    it: etymologyResult({
      word: 'sale',
      language: 'it',
      definition: 'Salt, a mineral used in food.',
    }),
  },
  otherLanguages: [],
  revision: 1,
  tracedAt: '2026-11-10T00:00:00.000Z',
}

describe('EntryView merged entries', () => {
  test('selects the requested language without mixing sibling definitions', () => {
    const html = renderToStaticMarkup(<EntryView entry={entry} language="it" />)
    expect(html).toContain('Salt, a mineral used in food.')
    expect(html).not.toContain('The act of selling.')
    expect(html).toContain('lang="it" dir="auto"')
    expect(html).toContain('href="/word/it/sale"')
  })

  test('preserves stale entry content alongside the explicit retrace action', () => {
    const html = renderToStaticMarkup(<EntryView entry={entry} stale />)
    expect(html).toContain('The act of selling.')
    expect(html).toContain('Retrace</button>')
    expect(renderToStaticMarkup(<EntryView entry={entry} />)).not.toContain('Retrace</button>')
  })

  test('renders an unavailable requested language without dereferencing an absent result', () => {
    const html = renderToStaticMarkup(<EntryView entry={entry} language="fr" />)
    expect(html).toContain('No supported French entry was found')
    expect(html).toContain('href="/word/sale"')
    const incomplete = renderToStaticMarkup(
      <EntryView entry={{ ...entry, incomplete: true }} language="fr" />
    )
    expect(incomplete).toContain('French entry is temporarily unavailable')
    expect(incomplete).not.toContain('No supported French entry was found')
  })
})
