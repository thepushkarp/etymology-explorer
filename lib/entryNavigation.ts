import { LANGUAGES, isLanguageCode, type LanguageCode } from './languages'
import { historyChoices } from './resultHistories'
import { normalizeScriptTargets } from './scriptTargets'
import type { EntrySelection } from './entrySelection'
import type { LookupGroup, ScriptTarget, WordEntry } from './types'

export interface EntryTarget extends ScriptTarget, EntrySelection {
  label: string
  details?: string
  local: boolean
}

export function entryNavigation({
  word,
  language,
  entry,
  languages = entry?.languages ?? [],
  failedLanguages = entry?.failedLanguages,
  otherScripts,
  group,
  selection = {},
}: {
  word: string
  language: LanguageCode
  entry?: WordEntry
  languages?: LanguageCode[]
  failedLanguages?: WordEntry['failedLanguages']
  otherScripts?: ScriptTarget[]
  group?: LookupGroup
  selection?: EntrySelection
}) {
  const result = entry?.entries[language]
  const saved = new Set([...languages, ...Object.keys(failedLanguages ?? {})])
  const offers = normalizeScriptTargets(otherScripts)
  const grouped = group?.choices.filter((choice) => choice.language === language) ?? []
  const lookup = group?.reading ?? selection.lookup
  const choices: EntryTarget[] = grouped.length
    ? grouped.map((choice) => ({
        ...choice,
        lookup,
        details: choice.reading,
        local: choice.word === word && saved.has(choice.language),
      }))
    : !selection.lookup || group
      ? result
        ? historyChoices(result).map((choice) => ({
            word,
            language,
            historyId: choice.id,
            label: choice.label,
            details: choice.formOf
              ? `form of ${choice.formOf.word}`
              : choice.partsOfSpeech.join(' · ') || choice.entryKind,
            lookup,
            local: true,
          }))
        : []
      : []
  const current = choices.filter((choice) => choice.word === word)
  const active = selection.historyId
    ? current.find((choice) => choice.historyId === selection.historyId)
    : current[0]
  // A source-linked reading is not interchangeable with a word's primary history.
  const historyId = result?.histories.some((history) => history.id === active?.historyId)
    ? active?.historyId
    : undefined
  const codes = [
    ...new Set([
      ...saved,
      ...offers.map((target) => target.language),
      ...(group?.languages.map((target) => target.language) ?? []),
      language,
    ]),
  ]
    .filter(isLanguageCode)
    .sort((a, b) => LANGUAGES[a].priority - LANGUAGES[b].priority)
  const tabs: EntryTarget[] = codes.map((code) => {
    const first = group?.choices.find((choice) => choice.language === code)
    const related = offers.filter((target) => target.language === code)
    const target =
      first ??
      (saved.has(code)
        ? { word, language: code }
        : (group?.languages.find((target) => target.language === code) ??
          related[0] ?? { word, language: code }))
    // Lookup context describes Japanese reading groups and their verified language members.
    const supportsLookup =
      code === 'ja' ||
      group?.languages.some((member) => member.language === code && member.word === target.word)
    return {
      ...target,
      historyId: first?.historyId,
      lookup: supportsLookup ? (lookup ?? (related.length > 1 ? word : undefined)) : undefined,
      label: LANGUAGES[code].englishName,
      local: target.word === word && saved.has(code),
    }
  })
  return {
    word,
    language,
    label: lookup ?? word,
    tabs,
    choices,
    active,
    historyId,
    grouped: grouped.length > 0,
    unresolved: Boolean(result && !historyId) || Boolean(selection.lookup && !group),
    defaultTarget: grouped.length && !current.length ? grouped[0] : undefined,
  }
}

export type EntryNavigationModel = ReturnType<typeof entryNavigation>
