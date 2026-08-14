import { describe, expect, test } from 'bun:test'
import { resolveJapaneseLexeme, romajiToHiragana, selectJapaneseCandidate } from './resolver'

async function only(query: string) {
  const resolution = await resolveJapaneseLexeme(query)
  expect(resolution.status).toBe('unique')
  if (resolution.status !== 'unique') throw new Error(`Expected a unique resolution for ${query}`)
  return resolution.candidates[0]
}

describe('Japanese lexical resolution', () => {
  test('converges kanji, kana, plain romaji, and macron romaji on one JMdict entry', async () => {
    const forms = await Promise.all(['学校', 'がっこう', 'gakkou', 'gakkō'].map(only))
    expect(new Set(forms.map((candidate) => candidate.entryId))).toEqual(new Set(['1206730']))
    expect(forms.every((candidate) => candidate.lemma === '学校')).toBe(true)
    expect(romajiToHiragana('gakkō')).toBe('がっこう')
  })

  test('resolves bounded verb and adjective inflections only to compatible POS entries', async () => {
    expect(await only('食べました')).toMatchObject({ lemma: '食べる', reading: 'たべる' })
    expect(await only('泳いでいる')).toMatchObject({ lemma: '泳ぐ' })
    expect(await only('書ける')).toMatchObject({ lemma: '書く' })
    expect(await only('しました')).toMatchObject({ lemma: 'する', partOfSpeech: ['suru verb'] })
    expect(await only('来ました')).toMatchObject({ lemma: '来る' })
    expect(await only('高くなかった')).toMatchObject({ lemma: '高い' })
    expect(await only('よかった')).toMatchObject({ lemma: 'いい' })
  })

  test('normalizes katakana loanword romaji with long vowels', async () => {
    for (const query of ['コーヒー', 'koohii', 'kōhī']) {
      expect(await only(query)).toMatchObject({ entryId: '1049180', lemma: 'コーヒー' })
    }
  })

  test('keeps homographs separate and rejects unsupported sentence-like input', async () => {
    const bridge = await resolveJapaneseLexeme('はし')
    expect(bridge.status).toBe('ambiguous')
    expect(bridge.candidates.map((candidate) => candidate.entryId)).toContain('1237410')
    expect(bridge.candidates.map((candidate) => candidate.entryId)).toContain('1476410')
    expect(new Set(bridge.candidates.map((candidate) => candidate.entryId)).size).toBe(
      bridge.candidates.length
    )
    expect(selectJapaneseCandidate(bridge, null)).toEqual({ status: 'selection_required' })
    expect(selectJapaneseCandidate(bridge, '1476410')).toMatchObject({
      status: 'selected',
      candidate: { entryId: '1476410', lemma: '箸' },
    })

    expect((await resolveJapaneseLexeme('これは文です')).status).toBe('not_found')
  })

  test('uses the common kana headword when kanji spellings are uncommon', async () => {
    expect(await only('ありがとう')).toMatchObject({ lemma: 'ありがとう', reading: 'ありがとう' })
  })
})
