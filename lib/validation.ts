import { canonicalizeWord, MAX_WORD_LENGTH, WORD_PATTERN } from './orthography'
export { canonicalizeWord, MAX_WORD_LENGTH } from './orthography'

const AFFIX_PATTERN = /^(?:[-‐‑]\p{L}[\p{L}\p{M}]*|\p{L}[\p{L}\p{M}]*[-‐‑])$/u

export function isValidWord(word: string): boolean {
  const normalized = canonicalizeWord(word)
  return (
    (WORD_PATTERN.test(normalized) || AFFIX_PATTERN.test(normalized)) &&
    normalized.length <= MAX_WORD_LENGTH &&
    normalized.length > 0
  )
}
