import { expect, test } from 'bun:test'
import { entryNavigation } from './entryNavigation'
import { entryPagePath, parseEntrySelection, selectionFromLocation } from './entrySelection'
import { etymologyResult } from './testSupport/etymologyResult'
import type { LookupGroup, WordEntry } from './types'

const result = etymologyResult({
  word: '白',
  language: 'ja',
  definition: 'An unrelated haku reading.',
})
result.histories[0].id = 'haku'
result.primaryHistoryId = 'haku'
const entry: WordEntry = {
  word: '白',
  languages: ['ja'],
  entries: { ja: result },
  otherLanguages: [],
  revision: 6,
  tracedAt: '2026-11-13T00:00:00Z',
  failedLanguages: { fr: { kind: 'transient', message: 'Unavailable.', retryAt: '2099-01-01' } },
}
const group: LookupGroup = {
  reading: 'しろ',
  members: [{ word: '白', language: 'ja' }],
  choices: [{ word: '白', language: 'ja', label: '白 — white', reading: 'しろ' }],
  languages: [{ word: 'しろ', language: 'ja' }],
}

test('a missing grouped history cannot fall back to an unrelated reading; failed tabs survive', () => {
  const model = entryNavigation({ word: entry.word, language: 'ja', entry, group })
  expect(model.historyId).toBeUndefined()
  expect(model.unresolved).toBe(true)
  expect(model.tabs.map((tab) => tab.language)).toEqual(['fr', 'ja'])
  expect(entryNavigation({ word: entry.word, language: 'ja', entry }).historyId).toBe('haku')
})

test('direct selection uses the first history and invalid or unavailable context does not select one', () => {
  const second = { ...result.histories[0], id: 'second' }
  const saved = {
    ...entry,
    entries: {
      ja: { ...result, primaryHistoryId: 'second', histories: [...result.histories, second] },
    },
  }
  expect(entryNavigation({ word: entry.word, language: 'ja', entry: saved }).historyId).toBe('haku')
  for (const selection of [{ historyId: 'missing' }, { lookup: 'unrelated' }]) {
    expect(
      entryNavigation({ word: entry.word, language: 'ja', entry: saved, selection }).unresolved
    ).toBe(true)
  }
})

test('selection URLs round-trip native text and history IDs without hash-only state', () => {
  const selection = { lookup: 'しろ', historyId: 'en:Japanese/Etymology 1' }
  const href = entryPagePath('白', 'ja', selection)
  expect(href).not.toContain('#')
  expect(selectionFromLocation(href, '白')).toEqual({ ...selection, language: 'ja' })
  expect(selectionFromLocation(href, '城')).toBeUndefined()
  expect(parseEntrySelection(new URLSearchParams('lookup=a&lookup=b&history=%00'))).toEqual({
    lookup: undefined,
    historyId: undefined,
  })
})

test('Indic written-form offers open cached entries without Japanese lookup context', () => {
  for (const [language, words] of [
    ['hi', ['काला', 'कला']],
    ['sa', ['कला', 'काल']],
    ['ur', ['کالا', 'کلا']],
  ] as const) {
    const offered = entryNavigation({
      word: 'kala',
      language: 'en',
      otherScripts: words.map((word) => ({ word, language })),
    }).tabs.find((tab) => tab.language === language)!
    const selection = parseEntrySelection(
      new URL(entryPagePath(offered.word, language, offered), 'https://etymex.com').searchParams
    )
    expect(selection.lookup).toBeUndefined()
    const result = etymologyResult({ word: words[0], language })
    const target = entryNavigation({
      word: result.word,
      language,
      selection,
      entry: {
        ...entry,
        word: result.word,
        languages: [language],
        entries: { [language]: result },
      },
    })
    expect(target.unresolved).toBe(false)
    expect(target.historyId).toBe(result.primaryHistoryId)
  }
})

test('Japanese groups retain their English member context without leaking it to other offers', () => {
  const model = entryNavigation({
    word: entry.word,
    language: 'ja',
    entry,
    group: { ...group, languages: [...group.languages, { word: 'shiro', language: 'en' }] },
    otherScripts: [{ word: 'कला', language: 'hi' }],
  })
  expect(model.tabs.find((tab) => tab.language === 'en')?.lookup).toBe('しろ')
  expect(model.tabs.find((tab) => tab.language === 'hi')?.lookup).toBeUndefined()
})
