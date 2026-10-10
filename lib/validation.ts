import { CONFIG } from './config'

import { canonicalizeWord } from './orthography'
export { canonicalizeWord } from './orthography'

export function isValidWord(word: string): boolean {
  const normalized = canonicalizeWord(word)
  return (
    CONFIG.wordPattern.test(normalized) &&
    normalized.length <= CONFIG.maxWordLength &&
    normalized.length > 0
  )
}
