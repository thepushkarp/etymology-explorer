import greWordsData from '@/data/gre-words.json'

const greWords: string[] = greWordsData.words

/**
 * Get a random word from the GRE list
 * Uses crypto for true randomness (not LLM-biased)
 */
export function getRandomWord(): string {
  // Use crypto.getRandomValues for better randomness in browser/Node
  const array = new Uint32Array(1)

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    // Fallback for environments without crypto
    array[0] = Math.floor(Math.random() * 0xffffffff)
  }

  const index = array[0] % greWords.length
  return greWords[index]
}

/**
 * Get multiple random words (for batch suggestions)
 */
export function getRandomWords(count: number): string[] {
  const selected = new Set<string>()

  while (selected.size < count && selected.size < greWords.length) {
    selected.add(getRandomWord())
  }

  return Array.from(selected)
}

/**
 * Get total word count
 */
export function getWordCount(): number {
  return greWords.length
}

/**
 * Search words that start with a prefix
 */
export function searchByPrefix(prefix: string, limit: number = 10): string[] {
  const normalized = prefix.toLowerCase().trim()
  return greWords.filter((word) => word.startsWith(normalized)).slice(0, limit)
}
