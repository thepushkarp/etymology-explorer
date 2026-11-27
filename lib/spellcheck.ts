import { canonicalizeWord } from './orthography'
import { WordSuggestion } from './types'
import { rankMatches } from './suggestionRanking'
import greWordsData from '@/data/gre-words.json'

const greWords: string[] = greWordsData.words

/**
 * Calculate Levenshtein distance between two strings (O(min(m, n)) space).
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  const prev = new Int32Array(shorter.length + 1)
  const curr = new Int32Array(shorter.length + 1)
  for (let j = 0; j <= shorter.length; j++) prev[j] = j

  for (let i = 1; i <= longer.length; i++) {
    curr[0] = i
    const li = longer.charCodeAt(i - 1)
    for (let j = 1; j <= shorter.length; j++) {
      const cost = li === shorter.charCodeAt(j - 1) ? 0 : 1
      const del = prev[j] + 1
      const ins = curr[j - 1] + 1
      const sub = prev[j - 1] + cost
      curr[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub
    }
    prev.set(curr)
  }

  return prev[shorter.length]
}

/**
 * Get spelling suggestions for a word
 * @param input - The potentially misspelled word
 * @param maxSuggestions - Maximum number of suggestions to return (default: 3)
 * @param maxDistance - Maximum Levenshtein distance to consider (default: 3)
 * @returns Array of suggestions sorted by distance
 */
export function getSuggestions(
  input: string,
  maxSuggestions: number = 3,
  maxDistance: number = 3
): WordSuggestion[] {
  const normalizedInput = canonicalizeWord(input)
  const suggestions: WordSuggestion[] = []
  for (const word of greWords) {
    if (Math.abs(normalizedInput.length - word.length) > maxDistance) continue
    const distance = levenshteinDistance(normalizedInput, word)
    if (distance > 0 && distance <= maxDistance) {
      suggestions.push({ word, distance })
    }
  }
  suggestions.sort((a, b) => a.distance - b.distance)
  return suggestions.slice(0, maxSuggestions)
}

/**
 * Autocomplete suggestions for a partial word: prefix matches first, then
 * substring matches, then near-miss (typo) corrections to fill up to the limit.
 */
export function getAutocompleteSuggestions(input: string, limit: number = 5): WordSuggestion[] {
  const normalizedInput = canonicalizeWord(input)

  const matches = rankMatches(greWords, normalizedInput, limit)
  const suggestions: WordSuggestion[] = matches.map((word) => ({
    word,
    distance: word === normalizedInput ? 0 : levenshteinDistance(normalizedInput, word),
  }))

  if (suggestions.length < limit) {
    const matched = new Set(matches)
    const typoFill = getSuggestions(normalizedInput, limit).filter((s) => !matched.has(s.word))
    suggestions.push(...typoFill.slice(0, limit - suggestions.length))
  }

  const exactIndex = suggestions.findIndex((s) => s.word === normalizedInput)
  if (exactIndex > 0) {
    const [exact] = suggestions.splice(exactIndex, 1)
    suggestions.unshift(exact)
  }

  return suggestions
}
