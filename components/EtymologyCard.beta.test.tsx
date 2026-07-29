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
    roots: [
      {
        root: 'fides',
        origin: 'Latin',
        meaning: 'faith',
        relatedWords: ['fidelity'],
      },
    ],
    ancestryGraph: { branches: [] },
    lore: 'A history of trust.',
    sources: [],
  }
}

describe('beta kin navigation', () => {
  test('keeps untagged beta kin visible without making a guessed language link', () => {
    const markup = renderToStaticMarkup(
      <EtymologyCard result={result('it')} onWordClick={() => undefined} />
    )

    expect(markup).toContain('>fidelity</span>')
    expect(markup).not.toContain('>fidelity</button>')
  })

  test('preserves navigation for established English related words', () => {
    const markup = renderToStaticMarkup(
      <EtymologyCard result={result('en')} onWordClick={() => undefined} />
    )

    expect(markup).toContain('>fidelity</button>')
  })
})
