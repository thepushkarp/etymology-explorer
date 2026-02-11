import { CONFIG } from './config'

/** NFKC-normalize, trim, and lowercase raw user input. */
export function canonicalizeWord(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase()
}

export function isValidWord(word: string): boolean {
  return CONFIG.wordPattern.test(word) && word.length <= CONFIG.maxWordLength && word.length > 0
}
