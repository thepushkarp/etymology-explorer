import { describe, expect, test } from 'bun:test'
import { visibleFetchedWords, type SuggestionFetchState } from './SearchSuggestions'

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
})
