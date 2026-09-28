import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EtymologyCard } from './EtymologyCard'
import type { DisplayEtymologyResult } from '@/lib/types'

function result(language: 'en' | 'it'): DisplayEtymologyResult {
  return {
    language,
    word: 'fede',
    pronunciation: '/ˈfe.de/',
    definition: 'faith',
    roots: [{ root: 'fides', origin: 'Latin', meaning: 'faith', relatedWords: ['fidelity'] }],
    ancestryGraph: { branches: [] },
    lore: 'A history of trust.',
    sources: [],
  }
}

describe('EtymologyCard', () => {
  test('links English kin to word pages', () => {
    const markup = renderToStaticMarkup(<EtymologyCard result={result('en')} />)
    expect(markup).toContain('href="/word/fidelity"')
    expect(markup).not.toContain('β')
  })

  test('marks beta entries and keeps their untagged kin as plain text', () => {
    const markup = renderToStaticMarkup(<EtymologyCard result={result('it')} />)
    expect(markup).toContain('β')
    expect(markup).toContain('<span>fidelity</span>')
    expect(markup).not.toContain('href="/word/fidelity"')
  })

  test('holds places for sections that have not streamed in yet', () => {
    const streaming = { ...result('en'), definition: '', lore: '' }
    const markup = renderToStaticMarkup(<EtymologyCard result={streaming} pending />)
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('id="entry-ancestry"')
    expect(markup).toContain('id="entry-story"')
  })
})
