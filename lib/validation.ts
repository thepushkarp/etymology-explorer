import { CONFIG } from './config'

export function isValidWord(word: string): boolean {
  return CONFIG.wordPattern.test(word) && word.length <= CONFIG.maxWordLength && word.length > 0
}
