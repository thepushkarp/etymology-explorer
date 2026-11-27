import { LANGUAGES, isLanguageCode, type LanguageCode } from './languages'
import { historyChoice } from './resultHistories'
import { initialCapitalTitle } from './orthography'
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
  histories = entry?.entries[language]?.histories,
}: {
  word: string
  language: LanguageCode
  entry?: WordEntry
  languages?: LanguageCode[]
  failedLanguages?: WordEntry['failedLanguages']
  otherScripts?: ScriptTarget[]
  group?: LookupGroup
  histories?: import('./types').LexicalHistory[]
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
        ? histories
          ? histories
              .map((h) => historyChoice(h, word))
              .map((choice) => ({
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
  const title = selection.capitalized ? initialCapitalTitle(word) : word
  const matching =
    restrictToGroup || grouped.length || (selection.lookup && !group)
      ? []
      : (histories ?? []).filter((history) =>
          selection.historyId
            ? history.spellingVariants?.some(
                (variant) => variant.previousHistoryId === selection.historyId
              )
            : (title !== undefined && history.sourceTitle === title) ||
              history.spellingVariants?.some((variant) => variant.word === title)
        )
  let active = selection.historyId
    ? current.find((choice) => choice.historyId === selection.historyId)
    : undefined
  if (!active) {
    if (matching.length > 0) active = current.find((choice) => choice.historyId === matching[0].id)
    else if (!selection.historyId) active = current[0]
  }
  // A source-linked reading is not interchangeable with a word's primary history.
  const historyId = histories?.some((history) => history.id === active?.historyId)
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
      ...(selection.capitalized && target.word === word ? { capitalized: true } : {}),
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
    defaultTarget:
      !selection.historyId && grouped.length && !current.length ? grouped[0] : undefined,
  }
}

export type EntryNavigationModel = ReturnType<typeof entryNavigation>
