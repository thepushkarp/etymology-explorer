import { candidateLanguages, isLanguageCode } from './languages'
import { canonicalizeWord, isValidWord } from './validation'
import type { ScriptTarget } from './types'

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
