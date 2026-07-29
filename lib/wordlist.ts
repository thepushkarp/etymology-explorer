import greWordsData from '@/data/gre-words.json'
import discoveryWordsData from '@/data/discovery-words.json'
import type { LanguageCode } from '@/lib/languages'

const greWords: string[] = greWordsData.words

const RANDOM_WORDS: Record<LanguageCode, readonly string[]> = {
  en: greWords,
  ...discoveryWordsData,
}

export function getRandomWordPool(language: LanguageCode = 'en'): readonly string[] {
  return RANDOM_WORDS[language]
}

/**
 * Get a random word from the selected language's discovery pool
 * Uses crypto for true randomness (not LLM-biased)
 */
export function getRandomWord(language: LanguageCode = 'en'): string {
  const words = getRandomWordPool(language)
  // Use crypto.getRandomValues for better randomness in browser/Node
  const array = new Uint32Array(1)

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    // Fallback for environments without crypto
    array[0] = Math.floor(Math.random() * 0xffffffff)
  }

  const index = array[0] % words.length
  return words[index]
}

/**
 * Get multiple random words (for batch suggestions)
 */
export function getRandomWords(count: number, language: LanguageCode = 'en'): string[] {
  const words = getRandomWordPool(language)
  const selected = new Set<string>()

  while (selected.size < count && selected.size < words.length) {
    selected.add(getRandomWord(language))
  }

  return Array.from(selected)
}

/**
 * Get total word count
 */
export function getWordCount(language: LanguageCode = 'en'): number {
  return getRandomWordPool(language).length
}

/**
 * Search words that start with a prefix
 */
export function searchByPrefix(prefix: string, limit: number = 10): string[] {
  const normalized = prefix.toLowerCase().trim()
  return greWords.filter((word) => word.startsWith(normalized)).slice(0, limit)
}
