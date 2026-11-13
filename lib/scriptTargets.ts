import { candidateLanguages, isLanguageCode } from './languages'
import { canonicalizeWord, isValidWord } from './validation'
import type { EntrySpelling, ScriptTarget, EtymologyResult } from './types'
import type { LanguageCode } from './languages'

/** A Japanese transliteration alone does not make it relevant to another language's history. */
export function relevantScriptTargets(
  targets: ScriptTarget[] | undefined,
  results: Array<Partial<Pick<EtymologyResult, 'language' | 'histories' | 'ancestryGraph'>>>,
  requestedLanguage?: LanguageCode
): ScriptTarget[] {
  const japanese =
    requestedLanguage === 'ja' ||
    results.some(
      (result) =>
        result.language === 'ja' ||
        [
          result.ancestryGraph,
          ...(result.histories?.map((history) => history.ancestryGraph) ?? []),
        ].some((graph) =>
          [
            ...(graph?.branches.flatMap((branch) => branch.stages) ?? []),
            ...(graph?.postMerge ?? []),
          ].some(
            (stage) =>
              /^(?:(?:Old|Middle|Early Middle|Late Middle|Classical|Modern) )?Japanese$/i.test(
                stage.stage.trim()
              ) || stage.stage === 'ja'
          )
        )
    )
  return normalizeScriptTargets(targets).filter((target) => target.language !== 'ja' || japanese)
}

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
    const key = `${language}:${word}`
    const previous = targets.get(key)
    targets.set(key, {
      ...previous,
      word,
      language,
      ...(typeof item.reading === 'string' ? { reading: item.reading } : {}),
      ...(typeof item.meaning === 'string' ? { meaning: item.meaning } : {}),
      ...(typeof item.sourceUrl === 'string' && /^https:\/\//.test(item.sourceUrl)
        ? { sourceUrl: item.sourceUrl }
        : {}),
    })
  }
  return [...targets.values()]
}
