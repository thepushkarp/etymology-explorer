import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import HistoricalContext, { wikipediaSourceUrl } from './HistoricalContext'
import type { SourceReference } from '@/lib/types'

describe('HistoricalContext', () => {
  test('renders the section mark as a real § character', () => {
    const markup = renderToStaticMarkup(
      <HistoricalContext wikipediaExtract="Perfidy is a form of deception." />
    )

    expect(markup).toContain('§')
    expect(markup).not.toContain('\\u00a7')
  })

  test('renders nothing for an empty extract', () => {
    const markup = renderToStaticMarkup(<HistoricalContext wikipediaExtract="   " />)

    expect(markup).toBe('')
  })
})

describe('wikipediaSourceUrl', () => {
  const wikipediaSource: SourceReference = {
    name: 'wikipedia',
    url: 'https://en.wikipedia.org/wiki/Perfidy',
    word: 'perfidy',
  }
  const etymonlineSource: SourceReference = {
    name: 'etymonline',
    url: 'https://www.etymonline.com/word/perfidy',
    word: 'perfidy',
  }

  test('returns the wikipedia source URL when present', () => {
    expect(wikipediaSourceUrl([etymonlineSource, wikipediaSource])).toBe(
      'https://en.wikipedia.org/wiki/Perfidy'
    )
  })

  test('returns undefined when no wikipedia source exists', () => {
    expect(wikipediaSourceUrl([etymonlineSource])).toBeUndefined()
  })

  test('ignores wikipedia sources without a URL', () => {
    expect(wikipediaSourceUrl([{ name: 'wikipedia', word: 'perfidy' }])).toBeUndefined()
  })

  test('returns undefined for an empty source list', () => {
    expect(wikipediaSourceUrl([])).toBeUndefined()
  })
})
