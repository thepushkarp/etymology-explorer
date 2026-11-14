import { compareLookupSupport } from './lookupEvidence'
import { normalizeScriptTargets } from './scriptTargets'
import { canonicalizeWord } from './orthography'
import { isLanguageCode } from './languages'
import { historyChoice } from './resultHistories'
import type { LookupGroup, ScriptTarget, WordEntry } from './types'

export const isKanaWord = (word: string) =>
  /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(word)

export interface LookupGroupSeed {
  reading: string
  romanizations: string[]
  members: ScriptTarget[]
}

/** URL lookup context cannot join a word that is absent from its saved group. */
export function lookupGroupForWord(word: string, group?: LookupGroup): LookupGroup | undefined {
  return group && [...group.members, ...group.languages].some((target) => target.word === word)
    ? group
    : undefined
}

/** Saved readings propose cache reads; reverse links still require source confirmation. */
export function lookupGroupSeed(entry: WordEntry): LookupGroupSeed | undefined {
  if (!isKanaWord(entry.word)) return
  const result = entry.entries.ja
  if (!result) return
  const targets = normalizeScriptTargets(
    result.histories.flatMap((h) => h.counterparts ?? [])
  ).filter(
    (target) =>
      target.language === 'ja' &&
      target.word !== entry.word &&
      !entry.spellings?.some(
        (spelling) => spelling.language === 'ja' && spelling.word === target.word
      )
  )
  const romanizations = [
    ...new Set(
      result.histories
        .map((h) => h.transliteration)
        .filter((text): text is string => Boolean(text && /^[a-zāīūēōâîûêô' -]+$/i.test(text)))
        .map(canonicalizeWord)
    ),
  ]
  if (!targets.length && !romanizations.length) return
  return {
    reading: entry.word,
    romanizations,
    members: [{ word: entry.word, language: 'ja' }, ...targets],
  }
}

export function assembleLookupGroup(seed: LookupGroupSeed, entries: WordEntry[]): LookupGroup {
  const byWord = new Map(entries.map((entry) => [entry.word, entry]))
  const languages: ScriptTarget[] = []
  // A transliteration proposes a cache read, but a saved source link must confirm
  // the reverse navigation. It does not turn unrelated Latin words into aliases.
  for (const entry of entries) {
    if (
      !normalizeScriptTargets(entry.otherScripts).some(
        (target) =>
          target.language === 'ja' &&
          (target.word === seed.reading ||
            (entry.word === seed.reading &&
              seed.members.some((member) => member.word === target.word)))
      )
    )
      continue
    for (const language of [
      ...new Set([...entry.languages, ...Object.keys(entry.failedLanguages ?? {})]),
    ].filter(isLanguageCode)) {
      if (!languages.some((target) => target.language === language))
        languages.push({ word: entry.word, language })
    }
  }
  const choices: LookupGroup['choices'] = []
  for (const member of seed.members) {
    const result = byWord.get(member.word)?.entries.ja
    const histories =
      result?.histories.filter((history) => {
        // The kana index's redirect-list history is represented by its destinations.
        if (member.word === seed.reading)
          return !(
            history.entryKind === 'unresolved' &&
            (history.counterparts?.length ?? 0) > 1 &&
            !history.roots.length &&
            !history.ancestryGraph.branches.length
          )
        return (
          history.transliteration &&
          seed.romanizations.includes(canonicalizeWord(history.transliteration))
        )
      }) ?? []
    if (histories.length) {
      for (const history of histories)
        choices.push({
          ...member,
          historyId: history.id,
          reading: seed.reading,
          label: `${member.word} — ${history.definition.split(/[;；]/)[0] || history.label}`,
          details: historyChoice(history).details,
        })
    }
  }
  if (choices.length && !languages.some((target) => target.language === 'ja'))
    languages.unshift({ word: choices[0].word, language: 'ja' })
  const members: LookupGroup['members'] = seed.members.map((member) => ({
    ...member,
    lookupSupport: choices.some((choice) => choice.word === member.word) ? 'verified' : 'linked',
  }))
  members.sort((a, b) => compareLookupSupport(a.lookupSupport, b.lookupSupport))
  return { reading: seed.reading, members, choices, languages }
}
