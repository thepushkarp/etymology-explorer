import { expect, test } from 'bun:test'
import {
  parseEtymonlineText,
  parseWiktionaryText,
  formatParsedChainsForPrompt,
  parseDictionaryText,
} from './etymologyParser'
import { cleanWiktionaryHtml } from './wiktionaryEntryGroups'
import japaneseFixtures from './__fixtures__/japanese/wiktionary.json'

test('recorded donor histories preserve Portuguese, English and German period languages', () => {
  const links = (key: 'ja-pan' | 'pt-pao' | 'de-arbeit') => {
    const fixture = japaneseFixtures[key]
    return parseWiktionaryText(cleanWiktionaryHtml(fixture.html), fixture.word).links.map(
      ({ language, form }) => [language, form]
    )
  }
  expect(links('ja-pan')).toEqual([
    ['Portuguese', 'pão'],
    ['Latin', 'pānem'],
    ['English', 'pan'],
  ])
  expect(links('pt-pao')).toEqual([
    ['Old Galician-Portuguese', 'pan'],
    ['Latin', 'pānem'],
  ])
  expect(links('de-arbeit')).toEqual([
    ['Middle High German', 'arbeit'],
    ['Old High German', 'arbeit'],
    ['Proto-West Germanic', '*arbaiþi'],
    ['Proto-Germanic', '*arbaidiz'],
    ['Proto-Indo-European', '*h₃órbʰos'],
  ])
  const salaryman = japaneseFixtures['ja-salaryman']
  expect(
    parseWiktionaryText(cleanWiktionaryHtml(salaryman.html), salaryman.word).links.map(
      ({ language, form }) => [language, form]
    )
  ).toEqual([['English', 'salaried man']])
})

test('an institution founding date is not a word attestation', () => {
  const chain = parseWiktionaryText(
    'The Bank of England is one of the first modern central banks, established in 1694.\nInherited from Middle English banke.\n1625, Francis Bacon: Let it be no bank or common stock.',
    'bank'
  )
  expect(chain.dateAttested).toBeUndefined()
  expect(formatParsedChainsForPrompt([chain])).not.toContain('First attested: 1694')
})

test('specialist chains retain publisher identity and localized language abbreviations', () => {
  for (const [provider, text] of [
    ['deMauro', 'sec. XIII; dal lat. fenestra.'],
    ['dle', 'Del lat. fenestra.'],
    ['tlfi', 'Empr. au lat. fenestra.'],
    ['priberam', 'Do latim fenestra.'],
  ] as const) {
    const chain = parseDictionaryText(text, 'window', provider, {
      provider,
      historyId: 'history:window',
      evidenceScopeId: 'scope:window',
    })
    expect(chain.provider).toBe(provider)
    expect(chain.sourceFamily).toBe(provider === 'dle' ? 'raeAsale' : provider)
    expect(chain.links.map(({ language, form }) => [language, form])).toEqual([
      ['Latin', 'fenestra'],
    ])
    expect(chain.historyId).toBe('history:window')
  }
})
test('explicit lexical attestation and Etymonline opening dates survive', () => {
  expect(
    parseWiktionaryText('First attested in 1625. From Middle French banque.', 'bank').dateAttested
  ).toBe('1625')
  expect(parseEtymonlineText('1590s, from Latin perfidia.', 'perfidy').dateAttested).toBe('1590s')
})

test('historical language qualifiers are not mistaken for ancestral words', () => {
  for (const [text, language, form] of [
    ['Do latim vulgar *iānuella ‘portinha’.', 'Vulgar Latin', '*iānuella'],
    ['Del griego antiguo φλέγμα.', 'Ancient Greek', 'φλέγμα'],
    ['Du latin vulgaire *cattus.', 'Vulgar Latin', '*cattus'],
    ['Dal greco antico λόγος.', 'Ancient Greek', 'λόγος'],
    ['From Old English hūs.', 'Old English', 'hūs'],
  ]) {
    const [link] = parseDictionaryText(text, 'word', 'wiktionaryNative').links
    expect(link.language).toBe(language)
    expect(link.form).toBe(form)
    expect(link.isReconstructed).toBe(form.startsWith('*'))
    expect(text).toContain(link.rawSnippet)
  }
})

test('Indic and Persian chains retain source forms, readings, glosses and periods', () => {
  // Recorded English Wiktionary पानी etymology; reading spans retain their role.
  const text = cleanWiktionaryHtml(
    '<p>Inherited from Old Hindi पांनी (<span lang="inc-ohi-Latn" class="mention-tr tr Latn">pā̃nī</span>), from Apabhramsa पाणिउ (<span lang="inc-apa-Latn" class="mention-tr tr Latn">pāṇiu</span>), from Prakrit 𑀧𑀸𑀡𑀻𑀅 (<span lang="pra-Latn" class="mention-tr tr Latn">pāṇīa</span>), from Sanskrit पानीय (<span lang="sa-Latn" class="mention-tr tr Latn">pānīya</span>, “water, drink”).</p>'
  )
  const chain = parseWiktionaryText(text, 'पानी')
  expect(
    chain.links.map(({ language, form, transliteration, meaning }) => [
      language,
      form,
      transliteration,
      meaning,
    ])
  ).toEqual([
    ['Old Hindi', 'पांनी', 'pā̃nī', undefined],
    ['Apabhramsa', 'पाणिउ', 'pāṇiu', undefined],
    ['Prakrit', '𑀧𑀸𑀡𑀻𑀅', 'pāṇīa', undefined],
    ['Sanskrit', 'पानीय', 'pānīya', 'water, drink'],
  ])
  const persian = parseWiktionaryText(
    'Borrowed from Classical Persian کتاب (kitāb, “book”).',
    'کتاب'
  )
  expect(persian.links[0]).toMatchObject({
    language: 'Classical Persian',
    form: 'کتاب',
    transliteration: 'kitāb',
    meaning: 'book',
  })
  expect(
    parseWiktionaryText('From Sanskrit √धृ, from PIE root *dʰer- “hold”.', 'धर्म').links.map(
      ({ form }) => form
    )
  ).toEqual(['*dʰer-'])
  expect(parseWiktionaryText('From Sanskrit root √धृ.', 'धर्म').links).toEqual([])
  expect(
    parseWiktionaryText(
      'From Proto-Indo-European *dʰér-mos, from *dʰer- (“to hold, support”); the Sanskrit root is धृ (transliteration: dhṛ).',
      'धर्म'
    ).links.map(({ language, form }) => [language, form])
  ).toEqual([
    ['Proto-Indo-European', '*dʰér-mos'],
    ['Proto-Indo-European', '*dʰer-'],
  ])
  const glossOnly = parseWiktionaryText('From Sanskrit पानीय (water).', 'पानी').links[0]
  expect(glossOnly.meaning).toBe('water')
  expect(glossOnly.transliteration).toBeUndefined()
  expect(formatParsedChainsForPrompt([chain])).toContain('Sanskrit: पानीय (pānīya) "water, drink"')
})

test('historical forms preserve internal joiners and reject invalid joiner boundaries', () => {
  for (const form of ['क्\u200Dष', 'می\u200Cرود']) {
    expect(
      parseWiktionaryText(`From Hindi ${form} (reading, “gloss”).`, 'word').links[0]?.form
    ).toBe(form)
  }
  for (const form of ['\u200Dक', 'क\u200D', 'क\u200D\u200Dष', 'क-\u200Dष']) {
    expect(parseWiktionaryText(`From Hindi ${form}.`, 'word').links).toEqual([])
  }
})
