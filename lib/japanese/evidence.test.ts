import { describe, expect, test } from 'bun:test'
import type { SourceData } from '@/lib/types'
import { adaptJapaneseWiktionaryEvidence } from './evidence'

function source(heading: string, text: string): SourceData {
  return {
    text,
    url: 'https://example.test/entry',
    entryGroups: [
      {
        index: '2',
        number: '1.2',
        heading,
        anchor: 'Etymology_1',
        level: 3,
        text,
        sections: [
          {
            index: '3',
            number: '1.2.1',
            heading: 'Historical spelling',
            anchor: 'Historical_spelling',
            level: 4,
            path: [heading, 'Historical spelling'],
            text: 'historical spelling',
          },
        ],
      },
    ],
  }
}

describe('Japanese Wiktionary evidence adapter', () => {
  test('rejects lexical fallback groups that have no explicit etymology heading', () => {
    expect(
      adaptJapaneseWiktionaryEvidence(source('Japanese', 'A dictionary definition.'), 'en')
    ).toBeNull()
  })

  test('preserves numbered homographs and Japanese-specific evidence signals', () => {
    const adapted = adaptJapaneseWiktionaryEvidence(
      source('Etymology 1', 'A Sino-Japanese compound with rendaku and a historical spelling.'),
      'en'
    )
    expect(adapted).not.toBeNull()
    const payload = JSON.parse(adapted!.text)
    expect(payload.etymologies[0]).toMatchObject({
      homograph: 'Etymology 1',
      hasHistoricalSpelling: true,
      hasSoundChange: true,
      lexicalStrata: ['sino-japanese'],
    })
  })
})
