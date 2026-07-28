import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EntryHeader } from './etymology-card/EntryHeader'
import type { DisplayEtymologyResult } from '@/lib/types'

describe('EntryHeader beta identity', () => {
  test('shows the beta symbol for a selected non-English language and not for English', () => {
    const base: Omit<DisplayEtymologyResult, 'language'> = {
      word: 'casa',
      pronunciation: '/ˈka.za/',
      definition: 'abitazione',
      roots: [],
      ancestryGraph: { branches: [] },
      lore: 'storia',
      sources: [],
    }
    expect(renderToStaticMarkup(<EntryHeader result={{ ...base, language: 'it' }} />)).toContain(
      'β'
    )
    expect(
      renderToStaticMarkup(<EntryHeader result={{ ...base, language: 'en' }} />)
    ).not.toContain('β')
  })
})
