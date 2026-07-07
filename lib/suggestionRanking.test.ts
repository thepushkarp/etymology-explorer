import { describe, expect, test } from 'bun:test'
import { rankMatches } from './suggestionRanking'

const WORDS = ['perfidious', 'perennial', 'superb', 'imperil', 'terse', 'perfidious']

describe('rankMatches', () => {
  test('ranks prefix matches before substring matches', () => {
    expect(rankMatches(WORDS, 'per', 5)).toEqual(['perfidious', 'perennial', 'superb', 'imperil'])
  })

  test('deduplicates repeated words', () => {
    expect(rankMatches(WORDS, 'perfid', 5)).toEqual(['perfidious'])
  })

  test('applies the limit after ranking', () => {
    expect(rankMatches(WORDS, 'per', 2)).toEqual(['perfidious', 'perennial'])
  })

  test('returns empty for no matches', () => {
    expect(rankMatches(WORDS, 'zzz', 5)).toEqual([])
  })

  test('returns empty for an empty wordlist', () => {
    expect(rankMatches([], 'per', 5)).toEqual([])
  })
})
