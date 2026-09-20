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
