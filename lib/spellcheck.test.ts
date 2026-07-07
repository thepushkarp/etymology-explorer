import { describe, expect, test } from 'bun:test'
import { getAutocompleteSuggestions, isKnownWord } from './spellcheck'

describe('getAutocompleteSuggestions', () => {
  test('returns prefix matches from the wordlist', () => {
    const suggestions = getAutocompleteSuggestions('per')

    expect(suggestions.length).toBeGreaterThan(0)
    for (const suggestion of suggestions) {
      expect(suggestion.word).toContain('per')
    }
  })

  test('puts an exactly matching known word first with distance 0', () => {
    const suggestions = getAutocompleteSuggestions('perfidious')

    expect(isKnownWord('perfidious')).toBe(true)
    expect(suggestions[0]).toEqual({ word: 'perfidious', distance: 0 })
  })

  test('falls back to near-miss corrections when nothing matches literally', () => {
    const suggestions = getAutocompleteSuggestions('perfidios')

    expect(suggestions.map((s) => s.word)).toContain('perfidious')
  })

  test('respects the limit', () => {
    expect(getAutocompleteSuggestions('e', 3).length).toBeLessThanOrEqual(3)
  })

  test('returns empty for nonsense input', () => {
    expect(getAutocompleteSuggestions('xqzwvk')).toEqual([])
  })
})
