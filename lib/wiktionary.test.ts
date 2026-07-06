import { describe, expect, test } from 'bun:test'
import { extractEnglishEtymology } from '@/lib/wiktionary'

const MULTI_LANGUAGE_EXTRACT = [
  '== English ==',
  '',
  '=== Etymology ===',
  '',
  'From Middle English nyce, from Old French nice ("careless, clumsy"), from Latin nescius.',
  '',
  '=== Adjective ===',
  '',
  'nice (comparative nicer, superlative nicest)',
  '',
  '== French ==',
  '',
  '=== Etymology ===',
  '',
  'Inherited from Old French nice, from Latin nescius ("unknowing").',
  '',
  '=== Adjective ===',
  '',
  'nice (plural nices)',
].join('\n')

describe('extractEnglishEtymology', () => {
  test('returns only the English Etymology section, not other languages', () => {
    const text = extractEnglishEtymology(MULTI_LANGUAGE_EXTRACT)

    expect(text).toContain('From Middle English nyce')
    expect(text).not.toContain('Inherited from Old French')
    expect(text).not.toContain('comparative nicer')
  })

  test('joins numbered Etymology sections for polysemous words', () => {
    const extract = [
      '== English ==',
      '',
      '=== Etymology 1 ===',
      '',
      'From Old English mūs ("mouse").',
      '',
      '==== Noun ====',
      '',
      'mouse (plural mice)',
      '',
      '=== Etymology 2 ===',
      '',
      'From the resemblance of the pointing device to the rodent.',
      '',
      '==== Noun ====',
      '',
      'mouse (plural mouses)',
    ].join('\n')

    const text = extractEnglishEtymology(extract)

    expect(text).toContain('From Old English mūs')
    expect(text).toContain('resemblance of the pointing device')
    expect(text).not.toContain('plural mice')
  })

  test('returns null when there is no English section, so callers can fall back', () => {
    const extract = ['== Danish ==', '', '=== Etymology ===', '', 'From Old Norse brauð.'].join(
      '\n'
    )

    expect(extractEnglishEtymology(extract)).toBeNull()
  })

  test('returns null when the English section has no Etymology subsection', () => {
    const extract = ['== English ==', '', '=== Noun ===', '', 'rizz (uncountable)'].join('\n')

    expect(extractEnglishEtymology(extract)).toBeNull()
  })
})
