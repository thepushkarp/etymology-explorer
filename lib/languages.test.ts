import { describe, expect, test } from 'bun:test'
import { lexemeKey, parseLanguageCode, wordPagePath, type LanguageCode } from './languages'

describe('explicit language identity', () => {
  test('defaults only an omitted language to English and rejects unsupported tags', () => {
    expect(parseLanguageCode(null)).toBe('en')
    expect(parseLanguageCode('IT')).toBe('it')
    expect(parseLanguageCode('de')).toBeNull()
  })

  test('keeps same-spelling lexemes isolated in keys and routes', () => {
    expect(
      new Set(
        (['en', 'it', 'es', 'fr'] as LanguageCode[]).map((language) => lexemeKey(language, 'sale'))
      ).size
    ).toBe(4)
    expect(wordPagePath('Casa', 'it')).toBe('/word/it/casa')
    expect(wordPagePath('Casa', 'en')).toBe('/word/casa')
  })
})
