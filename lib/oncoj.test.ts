import { expect, test } from 'bun:test'
import { lookupOncoj } from './oncoj'

test('ONCOJ retains complete annotations, pinned provenance and explicit historical derivations', () => {
  const result = lookupOncoj('tatakap')!
  expect(result.lexicalLanguage).toBe('Old Japanese')
  expect(result.license).toContain('CC BY 4.0')
  expect(result.revisionId).toBe('fd34a1b284c5dd1e8008df9d3abcb28cfaf464bf')
  expect(result.text).toContain('<superEntry xml:id="l031018-main">')
  expect(result.entryGroups?.[0].relations).toContainEqual({
    subject: { word: 'tatakap', language: 'Old Japanese' },
    target: { word: 'tatak', language: 'Old Japanese' },
    relation: 'derived_from',
    snippet: 'ONCOJ l031018a: tatakap derives from tatak (l031019a).',
  })
})

test('transcription distinctions are retained and modern Japanese links are never inferred', () => {
  expect(lookupOncoj('pi')?.sourceEntryId).not.toEqual(lookupOncoj('pwi')?.sourceEntryId)
  expect(lookupOncoj('ko')?.sourceEntryId).not.toEqual(lookupOncoj('kwo')?.sourceEntryId)
  expect(lookupOncoj('tatakap', 'Japanese')).toBeNull()
  expect(lookupOncoj('戦う')).toBeNull()
})
