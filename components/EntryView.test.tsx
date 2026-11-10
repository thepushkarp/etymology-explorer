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

  test('keeps failed language tabs and an explicit cooldown-gated retry after reload', () => {
    const partial: WordEntry = {
      ...entry,
      languages: ['it'],
      entries: { it: entry.entries.it },
      failedLanguages: {
        en: {
          kind: 'validation',
          message: 'The English entry could not be completed.',
          retryAt: '2099-01-01T00:00:00.000Z',
        },
      },
    }
    const saved = renderToStaticMarkup(<EntryView entry={partial} />)
    expect(saved).toContain('Salt, a mineral used in food.')
    expect(saved).toContain('href="/word/en/sale"')
    expect(saved).toContain('English</a>')

    const failed = renderToStaticMarkup(<EntryView entry={partial} language="en" />)
    expect(failed).toContain('The English entry could not be completed.')
    expect(failed).toContain('Retry English</button>')
    expect(failed).toContain('disabled=""')
    expect(failed).toContain('dateTime="2099-01-01T00:00:00.000Z"')
    expect(failed).not.toContain('No supported English entry was found')
  })

  test('offers an explicit cooldown-gated retry for an unavailable language', () => {
    const html = renderToStaticMarkup(
      <EntryView
        entry={{
          ...entry,
          failedLanguages: {
            fr: {
              kind: 'unavailable',
              message: 'No supported French entry is available.',
              retryAt: '2026-11-10T00:00:00.000Z',
            },
          },
        }}
        language="fr"
      />
    )
    expect(html).toContain('No supported French entry is available.')
    expect(html).toContain('Retry French</button>')
    expect(html).toContain('disabled=""')
    expect(html).toContain('dateTime="2026-11-10T00:00:00.000Z"')
  })

  test('keeps a saved entry readable when its latest retrace failed', () => {
    const html = renderToStaticMarkup(
      <EntryView
        entry={{
          ...entry,
          failedLanguages: {
            it: {
              kind: 'transient',
              message: 'The latest Italian trace could not be completed.',
              retryAt: '2099-01-01T00:00:00.000Z',
            },
          },
        }}
        language="it"
      />
    )
    expect(html).toContain('Salt, a mineral used in food.')
    expect(html).toContain('The latest Italian trace could not be completed.')
    expect(html).toContain('Retry Italian</button>')
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

  test('retains script offers alongside a successful English entry', () => {
    const result = etymologyResult({ word: 'tsunami', definition: 'A large sea wave.' })
    const html = renderToStaticMarkup(
      <EntryView
        entry={{
          ...entry,
          word: 'tsunami',
          languages: ['en'],
          entries: { en: result },
          otherScripts: [{ word: '津波', language: 'ja' }],
        }}
      />
    )
    expect(html).toContain('A large sea wave.')
    expect(html).toContain('In other scripts')
    expect(html).toContain(`href="/word/ja/${encodeURIComponent('津波')}"`)
  })

  test('shows only the selected history’s source-attested counterpart', () => {
    const result = etymologyResult({ word: 'किताब', language: 'hi', definition: 'A book.' })
    result.histories[0].counterparts = [{ word: 'کتاب', language: 'ur' }]
    result.histories.push({
      ...result.histories[0],
      id: 'unselected-history',
      counterparts: [{ word: '書', language: 'ja' }],
    })
    const html = renderToStaticMarkup(
      <EntryView entry={{ ...entry, word: 'किताब', languages: ['hi'], entries: { hi: result } }} />
    )
    expect(html).toContain(`href="/word/ur/${encodeURIComponent('کتاب')}"`)
    expect(html).toContain('lang="ur" dir="auto"')
    expect(html).not.toContain(encodeURIComponent('書'))
  })
})
