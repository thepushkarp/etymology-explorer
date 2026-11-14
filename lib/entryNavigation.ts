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
  const offers = normalizeScriptTargets(otherScripts).filter(
    (target) =>
      target.language !== 'ja' ||
      group?.choices.some(
        (choice) => choice.word === target.word && choice.language === target.language
      )
  )
  const grouped = group?.choices.filter((choice) => choice.language === language) ?? []
  // Destinations stay constrained to the lookup's reading. An empty owner index
  // retains its saved content and recovery actions until matching entries arrive.
  const restrictToGroup = Boolean(
    group?.members.some((member) => member.language === language) &&
    (group.reading !== word || grouped.length)
  )
  const lookup = group?.reading ?? selection.lookup
  const choices: EntryTarget[] =
    restrictToGroup || grouped.length
      ? grouped.map((choice) => ({
          ...choice,
          lookup,
          details: choice.details,
          local: choice.word === word && saved.has(choice.language),
        }))
      : !selection.lookup || group
        ? result
          ? historyChoices(result).map((choice) => ({
              word,
              language,
              historyId: choice.id,
              label: choice.label,
              details: choice.details,
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
    // Context follows confirmed group membership, not a language's script or name.
    const supportsLookup =
      first ||
      (group &&
        [...group.members, ...group.languages].some(
          (member) => member.language === code && member.word === target.word
        ))
    return {
      ...target,
      historyId: first?.historyId,
      lookup: supportsLookup ? lookup : undefined,
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
    grouped: restrictToGroup || grouped.length > 0,
    unresolved: Boolean(result && !historyId) || Boolean(selection.lookup && !group),
    defaultTarget: grouped.length && !current.length ? grouped[0] : undefined,
  }
}

export type EntryNavigationModel = ReturnType<typeof entryNavigation>
