import { describe, expect, test } from 'bun:test'
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/languages'
import { isValidWord } from '@/lib/validation'
import { getRandomWordPool } from '@/lib/wordlist'

describe('language-aware discovery word pools', () => {
  test('provides 446 valid, unique words for every supported language', () => {
    for (const language of SUPPORTED_LANGUAGE_CODES) {
      const pool = getRandomWordPool(language)

      expect(pool.length).toBe(446)
      expect(new Set(pool).size).toBe(pool.length)
      expect(pool.every(isValidWord)).toBe(true)
    }
  })
})
