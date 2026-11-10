import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EtymologyCard } from './EtymologyCard'
import type { EtymologyEntry } from '@/lib/types'

function result(language: 'en' | 'it'): EtymologyEntry {
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
  test('formats the story as paragraphs with italic forms', () => {
    const entry = {
      ...result('en'),
      lore: 'From *fides*.\n\nFrom *bher-; **faith** remains *unfinished.',
    }
    const markup = renderToStaticMarkup(<EtymologyCard result={entry} />)
    expect(markup).toContain('<p>From <em><bdi lang="und" dir="auto">fides</bdi></em>.</p>')
    expect(markup).toContain('<p>From *bher-; **faith** remains *unfinished.</p>')
    expect(markup).not.toContain('<strong>')
  })

  test('links English kin to word pages', () => {
    const markup = renderToStaticMarkup(<EtymologyCard result={result('en')} />)
    expect(markup).toContain('href="/word/fidelity"')
  })

  test('writes other-language entries in English and keeps their untagged kin as plain text', () => {
    const entry = { ...result('it'), suggestions: { synonyms: ['fiducia'] } }
    const markup = renderToStaticMarkup(<EtymologyCard result={entry} />)
    expect(markup).toContain('Words from the same roots')
    expect(markup).toContain('<bdi lang="und" dir="auto">fidelity</bdi>')
    expect(markup).not.toContain('href="/word/fidelity"')
    expect(markup).not.toContain('fiducia')
    expect(markup).toContain('Further scholarly references')
  })

  test('sets usage examples after the story', () => {
    const entry = {
      ...result('en'),
      examples: [{ text: 'She kept *fede* with them.' }, { text: 'A second sentence.' }],
    }
    const markup = renderToStaticMarkup(<EtymologyCard result={entry} />)
    expect(markup.indexOf('id="entry-examples"')).toBeGreaterThan(
      markup.indexOf('id="entry-story"')
    )
    expect(markup).toContain('<em><bdi lang="und" dir="auto">fede</bdi></em>')
    expect(markup).toContain('A second sentence.')
  })

  test('glosses foreign-language examples with their translation', () => {
    const entry = {
      ...result('it'),
      examples: [{ text: 'Ha perso la fede.', translation: 'They lost their faith.' }],
    }
    const markup = renderToStaticMarkup(<EtymologyCard result={entry} />)
    expect(markup).toContain('lang="it"')
    expect(markup).toContain('Ha perso la fede.')
    expect(markup).toContain('They lost their faith.')
  })

  test('isolates native forms within English prose and places romanization beside IPA', () => {
    const entry: EtymologyEntry = {
      ...result('en'),
      language: 'ur',
      word: 'کتاب',
      transliteration: 'kitāb',
      pronunciation: '/kɪ.t̪ɑːb/',
      lore: 'From Persian *کتاب* (kitāb). The Hindi spelling is किताब.',
      roots: [{ root: 'کتاب', origin: 'Persian', meaning: 'book', relatedWords: [] }],
    }
    const markup = renderToStaticMarkup(<EtymologyCard result={entry} />)
    expect(markup).toContain('lang="ur" dir="auto"')
    expect(markup).toContain('<span lang="en" dir="ltr" class="font-serif">kitāb</span>')
    expect(markup.indexOf('>kitāb</span>')).toBeLessThan(markup.indexOf('/kɪ.t̪ɑːb/'))
    expect(markup).toContain('<em><bdi lang="und-Arab" dir="auto">کتاب</bdi></em>')
    expect(markup).toContain('<bdi lang="und-Deva" dir="auto">किताब</bdi>.')
  })

  test('omits examples for entries cached before they existed', () => {
    const markup = renderToStaticMarkup(<EtymologyCard result={result('en')} />)
    expect(markup).not.toContain('id="entry-examples"')
  })

  test('holds places for sections that have not streamed in yet', () => {
    const streaming = { ...result('en'), definition: '', lore: '' }
    const markup = renderToStaticMarkup(<EtymologyCard result={streaming} pending />)
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('id="entry-ancestry"')
    expect(markup).toContain('id="entry-story"')
    expect(markup).toContain('id="entry-examples"')
  })
})
