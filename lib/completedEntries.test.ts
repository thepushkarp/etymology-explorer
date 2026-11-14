import { expect, test } from 'bun:test'
import { getCompletedEntry, rememberCompletedEntry } from './completedEntries'
import type { WordEntry } from './types'
import { etymologyResult } from './testSupport/etymologyResult'

test('completed results restore only their request scope and retain a bounded recent set', () => {
  const result = etymologyResult({ word: '白', language: 'ja' })
  const entry: WordEntry = {
    word: '白',
    languages: ['ja'],
    entries: { ja: result },
    otherLanguages: [],
    tracedAt: new Date().toISOString(),
    revision: 6,
  }
  rememberCompletedEntry(entry, 'shiro', 'ja')
  expect(getCompletedEntry('shiro', 'ja')).toBe(entry)
  expect(getCompletedEntry('shiro')).toBeUndefined()
  expect(getCompletedEntry('白', 'ja')).toBe(entry)
  const updated = { ...entry, tracedAt: new Date(Date.now() + 1).toISOString() }
  rememberCompletedEntry(updated, '白', 'ja')
  expect(getCompletedEntry('shiro', 'ja')).toBe(updated)
  for (let i = 0; i < 20; i++) rememberCompletedEntry({ ...entry, word: `fixture${i}` })
  expect(getCompletedEntry('shiro', 'ja')).toBeUndefined()
})
