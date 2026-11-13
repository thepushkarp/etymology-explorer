import { expect, test } from 'bun:test'
import { normalizePronunciation, pronunciationKey, pronunciationReadings } from './pronunciation'

test('separates languages and readings while sharing equivalent IPA encodings', () => {
  expect(pronunciationKey('pain', 'en', 'peɪn')).not.toBe(pronunciationKey('pain', 'fr', 'pɛ̃'))
  expect(pronunciationKey('pan', 'fr', 'pan')).not.toBe(pronunciationKey('pan', 'fr', 'pɑ̃'))
  expect(normalizePronunciation('/pɛ̃/')).toBe(normalizePronunciation('[pɛ̃]'))
  expect(pronunciationReadings('(UK) /ɹɛd/, (US) /ɹɛd/')).toEqual(['ɹɛd'])
  expect(pronunciationReadings('/ɹiːd/, /ɹɛd/')).toEqual(['ɹiːd', 'ɹɛd'])
  for (const invalid of ['', '<break/>', '[laughs] /test/', '/a/ /b/', 'a\nb', 'x'.repeat(161)]) {
    expect(normalizePronunciation(invalid)).toBeUndefined()
  }
})
