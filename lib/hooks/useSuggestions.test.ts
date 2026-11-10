import { describe, expect, test } from 'bun:test'
import { visibleFetchedWords, type SuggestionFetchState } from './useSuggestions'

const fetched: SuggestionFetchState = {
  query: 'ca',
  language: 'en',
  words: ['cabal', 'cadence'],
}

describe('language-aware fetched suggestions', () => {
  test('hides a previous language while its replacement request is in flight', () => {
    expect(visibleFetchedWords(fetched, 'ca', 'it')).toEqual([])
  })

  test('retains same-language words that still match a changed query', () => {
    expect(visibleFetchedWords(fetched, 'cab', 'en')).toEqual(['cabal'])
  })

  test('keeps Auto results separate from an explicitly selected language', () => {
    const auto = { ...fetched, language: undefined }
    expect(visibleFetchedWords(auto, 'ca')).toEqual(['cabal', 'cadence'])
    expect(visibleFetchedWords(auto, 'ca', 'en')).toEqual([])
    expect(visibleFetchedWords(fetched, 'ca')).toEqual([])
  })
})
