import { WordSuggestion } from './types'
import greWordsData from '@/data/gre-words.json'

const greWords: string[] = greWordsData.words

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
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
  const normalizedInput = input.toLowerCase().trim()

  const suggestions: WordSuggestion[] = greWords
    .map((word) => ({
      word,
      distance: levenshteinDistance(normalizedInput, word),
    }))
    .filter((s) => s.distance <= maxDistance && s.distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)

  return suggestions
}

/**
 * Check if a word exists in the GRE word list
 */
export function isKnownWord(word: string): boolean {
  return greWords.includes(word.toLowerCase().trim())
}

/**
 * Check if input looks like a typo (has close matches) vs nonsense
 */
export function isLikelyTypo(input: string): boolean {
  const suggestions = getSuggestions(input, 1, 2)
  return suggestions.length > 0
}
