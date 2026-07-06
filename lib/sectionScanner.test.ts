import { describe, expect, test } from 'bun:test'
import { createSectionScanner } from '@/lib/sectionScanner'

interface Section {
  section: string
  data: unknown
}

function scanChunks(chunks: string[]): Section[] {
  const sections: Section[] = []
  const scanner = createSectionScanner((section, data) => sections.push({ section, data }))
  for (const chunk of chunks) {
    scanner.push(chunk)
  }
  return sections
}

/** Split text into fixed-size chunks to simulate arbitrary token boundaries. */
function chunked(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size))
  }
  return chunks
}

const SYNTHESIS_LIKE_JSON = JSON.stringify({
  word: 'telephone',
  pronunciation: '/ˈtɛlɪfoʊn/',
  definition: 'a device for far-off voices',
  ancestryGraph: {
    branches: [
      { root: 'tele', stages: [{ stage: 'Ancient Greek', form: 'tēle (τῆλε)', note: 'far off' }] },
      { root: 'phone', stages: [{ stage: 'Ancient Greek', form: 'φωνή', note: 'sound, voice' }] },
    ],
    convergencePoints: null,
    mergePoint: { form: 'telephone', note: 'coined for the "far-sound" device — {braces} kept' },
    postMerge: null,
  },
  roots: [
    {
      root: 'tele',
      origin: 'Greek',
      meaning: 'far',
      relatedWords: ['telegraph'],
      ancestorRoots: ['*kʷel-'],
      descendantWords: null,
    },
  ],
  lore: 'He said "wait, {really}?" and scribbled [notes] on the patent — 1876, Boston. 🚀',
  partsOfSpeech: [{ pos: 'noun', definition: 'the device', pronunciation: null }],
  suggestions: {
    synonyms: ['phone'],
    antonyms: [],
    homophones: [],
    easilyConfusedWith: [],
    seeAlso: ['telegraph'],
  },
  modernUsage: {
    hasSlangMeaning: false,
    slangDefinition: null,
    popularizedBy: null,
    contexts: null,
    notableReferences: null,
  },
  sources: [{ name: 'etymonline' }, { name: 'wiktionary' }],
})

const EXPECTED_SECTIONS = Object.entries(JSON.parse(SYNTHESIS_LIKE_JSON)).map(
  ([section, data]) => ({ section, data })
)

describe('createSectionScanner', () => {
  test('emits every top-level field in document order from a single push', () => {
    expect(scanChunks([SYNTHESIS_LIKE_JSON])).toEqual(EXPECTED_SECTIONS)
  })

  test.each([1, 2, 3, 7, 16])(
    'chunk boundaries never change the result (chunk size %d)',
    (size) => {
      expect(scanChunks(chunked(SYNTHESIS_LIKE_JSON, size))).toEqual(EXPECTED_SECTIONS)
    }
  )

  test('braces, brackets, quotes, and colons inside strings are opaque', () => {
    const json = '{"lore":"a \\"quoted\\" {brace} [bracket] , comma : colon","word":"x"}'
    expect(scanChunks(chunked(json, 3))).toEqual([
      { section: 'lore', data: 'a "quoted" {brace} [bracket] , comma : colon' },
      { section: 'word', data: 'x' },
    ])
  })

  test('handles escape sequences split across chunk boundaries', () => {
    const json = '{"note":"tab\\tand \\u00e9 accent","ok":true}'
    // Split right between the backslash and the escape character.
    const backslashAt = json.indexOf('\\')
    const chunks = [json.slice(0, backslashAt + 1), json.slice(backslashAt + 1)]
    expect(scanChunks(chunks)).toEqual([
      { section: 'note', data: 'tab\tand é accent' },
      { section: 'ok', data: true },
    ])
  })

  test('handles unicode: IPA, Greek script, combining marks, and astral-plane emoji', () => {
    const json = JSON.stringify({
      pronunciation: '/pərˈfɪdiəs/',
      form: 'τῆλε',
      pie: '*bʰeh₂-',
      emoji: '🚀🜁',
    })
    for (const size of [1, 5]) {
      expect(scanChunks(chunked(json, size))).toEqual([
        { section: 'pronunciation', data: '/pərˈfɪdiəs/' },
        { section: 'form', data: 'τῆλε' },
        { section: 'pie', data: '*bʰeh₂-' },
        { section: 'emoji', data: '🚀🜁' },
      ])
    }
  })

  test('parses primitive values: numbers, booleans, and null', () => {
    const json = '{"count": 42, "flag": false, "nothing": null, "pi": -3.5e2}'
    expect(scanChunks(chunked(json, 4))).toEqual([
      { section: 'count', data: 42 },
      { section: 'flag', data: false },
      { section: 'nothing', data: null },
      { section: 'pi', data: -350 },
    ])
  })

  test('skips leading noise before the root object opens', () => {
    expect(scanChunks(['\n \t{"word":"bread"}'])).toEqual([{ section: 'word', data: 'bread' }])
  })

  test('ignores trailing text after the root object closes', () => {
    expect(scanChunks(['{"word":"bread"} trailing {"not":"emitted"}'])).toEqual([
      { section: 'word', data: 'bread' },
    ])
  })

  test('emits nothing for an incomplete final field', () => {
    expect(scanChunks(['{"word":"bread","lore":"unfinished'])).toEqual([
      { section: 'word', data: 'bread' },
    ])
  })

  test('handles an empty root object and empty chunks', () => {
    expect(scanChunks(['', '{', '', '}'])).toEqual([])
  })

  test('nested objects with keys matching top-level names are not re-emitted', () => {
    const json = '{"outer":{"word":"inner","lore":{"word":"deep"}},"word":"top"}'
    expect(scanChunks(chunked(json, 2))).toEqual([
      { section: 'outer', data: { word: 'inner', lore: { word: 'deep' } } },
      { section: 'word', data: 'top' },
    ])
  })
})
