import { describe, expect, test } from 'bun:test'
import {
  LANGUAGES,
  lexemeKey,
  parseLanguageCode,
  wordPagePath,
  type LanguageCode,
} from './languages'

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

  test('keeps native etymology labels in the language registry', () => {
    expect(LANGUAGES.it.nativeEtymologyLabel).toBe('etimologia')
    expect(LANGUAGES.es.nativeEtymologyLabel).toBe('etimología')
    expect(LANGUAGES.fr.nativeEtymologyLabel).toBe('étymologie')
    expect(LANGUAGES.pt.nativeEtymologyLabel).toBe('etimologia')
  })
})
