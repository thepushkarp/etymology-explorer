import { candidateLanguages, isLanguageCode } from './languages'
import { canonicalizeWord, isValidWord } from './validation'
import type { EntrySpelling, ScriptTarget } from './types'
import type { LanguageCode } from './languages'

/** A unique attested kana reading avoids an ambiguous kanji reading in TTS. */
export function spellingPronunciation(
  language: LanguageCode,
  spellings: EntrySpelling[] = []
): string | undefined {
  if (language !== 'ja') return undefined
  const readings = spellings
    .filter(
      (spelling) =>
        spelling.language === language &&
        spelling.kind === 'spelling' &&
        /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(spelling.word)
    )
    .map((spelling) => spelling.word)
  const unique = new Set(
    readings.map((word) =>
      word
        .normalize('NFC')
        .replace(/[ァ-ヶ]/gu, (character) => String.fromCodePoint(character.codePointAt(0)! - 0x60))
    )
  )
  return unique.size === 1 ? readings[0] : undefined
}

/** Cache and transport metadata must remain valid navigation targets. */
export function normalizeScriptTargets(value: unknown): ScriptTarget[] {
  if (!Array.isArray(value)) return []
  const targets = new Map<string, ScriptTarget>()
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.word !== 'string') continue
    const language: unknown =
      typeof item.language === 'string' ? item.language.toLowerCase() : item.language
    if (!isLanguageCode(language)) continue
    const word = canonicalizeWord(item.word)
    if (!isValidWord(word) || !candidateLanguages(word).includes(language)) continue
    targets.set(`${language}:${word}`, { word, language })
  }
  return [...targets.values()]
}
