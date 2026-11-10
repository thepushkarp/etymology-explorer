import { describe, expect, test } from 'bun:test'
import {
  candidateLanguages,
  detectScripts,
  languageFromName,
  lexemeKey,
  lexicalLanguageName,
  parseLanguageCode,
  SUPPORTED_LANGUAGE_CODES,
  wordPagePath,
  type LanguageCode,
} from './languages'

describe('language registry and spelling identity', () => {
  test('parses allowed explicit tags and rejects path fragments', () => {
    expect(parseLanguageCode(null)).toBe('en')
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      expect(parseLanguageCode(code.toUpperCase())).toBe(code)
    }
    expect(parseLanguageCode('de')).toBeNull()
    expect(parseLanguageCode('<img src=x onerror=alert(1)>')).toBeNull()
    expect(parseLanguageCode('en/../it')).toBeNull()
    expect(languageFromName(' French ')).toBe('fr')
    expect(languageFromName('Old French')).toBeUndefined()
    expect(lexicalLanguageName(' latin ')).toBe('Latin')
  })

  test('keeps lexical identities distinct while primary entry routes omit a hint', () => {
    expect(
      new Set(
        (['en', 'it', 'es', 'fr'] as LanguageCode[]).map((language) => lexemeKey(language, 'sale'))
      ).size
    ).toBe(4)
    expect(wordPagePath('Casa', 'it')).toBe('/word/it/casa')
    expect(wordPagePath('  Casa ', 'en')).toBe('/word/en/casa')
    expect(wordPagePath('Café')).toBe(`/word/${encodeURIComponent('café')}`)
  })

  test('detects scripts without punctuation or combining-mark noise', () => {
    expect(detectScripts('cafe\u0301')).toEqual(['Latin'])
    expect(detectScripts('पानी')).toEqual(['Devanagari'])
    expect(detectScripts('کتاب')).toEqual(['Arabic'])
    expect(detectScripts('津波かなカナ')).toEqual(['Han', 'Hiragana', 'Katakana'])
    expect(detectScripts('サラリーマン')).toEqual(['Hiragana', 'Katakana'])
    expect(detectScripts('—')).toEqual([])
  })

  test('only returns languages that support every letter script, in registry priority', () => {
    expect(candidateLanguages('fenêtre')).toEqual(['en', 'it', 'es', 'fr', 'pt'])
    expect(candidateLanguages('chat')).toEqual(['en', 'it', 'es', 'fr', 'pt'])
    expect(candidateLanguages('chatपानी')).toEqual([])
    expect(candidateLanguages('aа')).toEqual([]) // Latin and Cyrillic
    expect(candidateLanguages('पानी')).toEqual([])
    expect(candidateLanguages('')).toEqual([])
  })
})
