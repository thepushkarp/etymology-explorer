import { expect, test } from 'bun:test'
import { extractWiktionaryLanguage } from './wiktionary'
import { scopeEnglishHistories } from './research'
import { finalizeResult } from './llm'
import { etymologyResult } from './testSupport/etymologyResult'
import { entryNavigation } from './entryNavigation'
import { entryPagePath, selectionFromLocation } from './entrySelection'
import { historyEntry } from './resultHistories'
import type { ResearchContext, SourceRecord } from './types'

const alias =
  '<span class="form-of-definition">Alternative letter-case form of <span class="form-of-definition-link"><i lang="en"><a href="/wiki/Macarena#English">Macarena</a></i></span></span>.<ul><li>A usage example.</li></ul>'
type Section = [heading: string, content: string]

function source(title: string, sections: Section[]): SourceRecord {
  const rows: Section[] = [['English', ''], ...sections]
  const toc = rows.map(([line], i) => ({
    line,
    index: String(i),
    anchor: 'h' + i,
    number: String(i),
    hLevel: i === 0 ? 2 : line.startsWith('Etymology') ? 3 : 4,
  }))
  const html = rows
    .map(([heading, body], i) => {
      const level = toc[i].hLevel
      return (
        `<h${level} id="h${i}">${heading}</h${level}>` +
        (['Noun', 'Proper noun', 'Verb'].includes(heading)
          ? `<p><strong lang="en" class="Latn headword">${title}</strong></p><ol>${body}</ol>`
          : body)
      )
    })
    .join('')
  const data = extractWiktionaryLanguage(
    { title, requestedWord: title, sections: toc, html, redirects: [] },
    'English'
  )!
  return { provider: 'wiktionary', sourceFamily: 'wiktionary', data }
}

function research(lower: Section[], upper: Section[]) {
  const context: ResearchContext = {
    language: 'en',
    mainWord: {
      word: 'macarena',
      etymonline: null,
      wiktionary: null,
      sources: [source('macarena', lower), source('Macarena', upper)],
    },
    rootResearch: [],
    identifiedRoots: [],
    relatedResearch: [],
    totalSourcesFetched: 0,
  }
  scopeEnglishHistories(context)
  return finalizeResult(
    etymologyResult({ word: 'macarena', definition: 'Meaning' }, context),
    context,
    'standard'
  )
}

const variant: Section[] = [['Noun', `<li>${alias}</li>`]]
const dance: Section[] = [['Noun', '<li>A dance.</li>']]

test('a pure dictionary variant shares one story, both publisher URLs and the old meaning link', () => {
  const before = research([['Noun', '<li>Independent.</li>']], dance)
  const after = research(variant, dance)
  expect(after.histories.map((h) => h.id)).toEqual([before.histories[1].id])
  const selected = historyEntry(after)
  expect(selected.sourceTitle).toBe('Macarena')
  expect(selected.spellingVariants).toEqual([
    {
      word: 'macarena',
      sourceUrl: 'https://en.wiktionary.org/wiki/macarena',
      previousHistoryId: before.histories[0].id,
    },
  ])
  expect(selected.sources.map((s) => s.url).sort()).toEqual([
    'https://en.wiktionary.org/wiki/Macarena',
    'https://en.wiktionary.org/wiki/macarena',
  ])
  const input = { word: 'macarena', language: 'en' as const, histories: after.histories }
  expect(
    entryNavigation({ ...input, selection: { historyId: before.histories[0].id } }).historyId
  ).toBe(after.primaryHistoryId)
  expect(entryNavigation(input).historyId).toBe(after.primaryHistoryId)
})

test('mixed spellings retain the independent choice and a capitalized search opens the matching entry', () => {
  const result = research([['Noun', `<li>${alias}</li><li>An independent definition.</li>`]], dance)
  const input = { word: 'macarena', language: 'en' as const, histories: result.histories }
  expect(result.histories[0].partsOfSpeech).toContainEqual({
    pos: 'noun',
    definition: 'An independent definition.',
  })
  expect(result.histories[0].label).toContain('An independent definition.')
  expect(result.histories[1].label).not.toContain('An independent definition.')
  expect(entryNavigation(input)).toMatchObject({ chooseMeaning: true, historyId: undefined })
  const href = entryPagePath('Macarena', 'en')
  expect(href).toBe('/word/en/macarena?case=initial')
  expect(
    entryNavigation({ ...input, selection: selectionFromLocation(href, 'macarena') })
  ).toMatchObject({ chooseMeaning: false, historyId: result.histories[1].id })
  expect(
    entryNavigation({ ...input, selection: { historyId: result.histories[0].id } }).historyId
  ).toBe(result.histories[0].id)
})

test('an unqualified link to two noun histories opens the choices, while a matching part of speech identifies one history', () => {
  const two = (second: string): Section[] => [
    ['Etymology 1', '<p>First origin.</p>'],
    ...dance,
    ['Etymology 2', '<p>Second origin.</p>'],
    [second, '<li>Second meaning.</li>'],
  ]
  const multiple = research(variant, two('Noun'))
  expect(multiple.histories).toHaveLength(2)
  expect(multiple.histories.every((h) => h.spellingVariants?.[0].entryOnly)).toBe(true)
  const previous = multiple.histories[0].spellingVariants![0].previousHistoryId!
  const input = { word: 'macarena', language: 'en' as const, histories: multiple.histories }
  for (const selection of [{}, { capitalized: true }, { historyId: previous }]) {
    expect(entryNavigation({ ...input, selection })).toMatchObject({
      chooseMeaning: true,
      historyId: undefined,
    })
  }
  const distinguished = research(variant, two('Verb'))
  expect(entryNavigation({ ...input, histories: distinguished.histories }).historyId).toBe(
    distinguished.histories[0].id
  )
})

test('a quotation, a cross-language link or a mismatched title cannot retire a history', () => {
  for (const content of [
    'A distinct meaning.<ul><li>' + alias + '</li></ul>',
    alias.replace('#English', '#French'),
    alias.replace('/wiki/Macarena', '/wiki/Another'),
  ]) {
    const result = research([['Noun', '<li>' + content + '</li>']], dance)
    expect(result.histories).toHaveLength(2)
    expect(result.histories.every((h) => !h.spellingVariants)).toBe(true)
  }
})
