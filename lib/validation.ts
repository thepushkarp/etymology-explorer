import { CONFIG } from './config'

export { canonicalizeWord } from './orthography'

export function isValidWord(word: string): boolean {
  return CONFIG.wordPattern.test(word) && word.length <= CONFIG.maxWordLength && word.length > 0
}
