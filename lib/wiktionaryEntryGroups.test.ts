import { describe, expect, test } from 'bun:test'
import { LANGUAGES, type LanguageCode } from './languages'
import japaneseFixtures from './__fixtures__/japanese/wiktionary.json'
import {
  cleanWiktionaryHtml,
  extractWiktionaryEntryGroups,
  extractWiktionaryRomanizations,
  extractWiktionarySpellingRedirect,
  extractWiktionaryVariants,
  isWiktionarySpellingLemma,
  type WiktionaryTocSection,
} from './wiktionaryEntryGroups'

test('counterparts require an exact scoped headword and a labelled, language-matched wiki target', () => {
  const sections = [
    { index: '1', line: 'Hindi', anchor: 'Hindi', hLevel: 2, number: '1' },
    { index: '2', line: 'Etymology 1', anchor: 'E1', hLevel: 3, number: '1.1' },
    { index: '3', line: 'Etymology 2', anchor: 'E2', hLevel: 3, number: '1.2' },
    { index: '4', line: 'Sanskrit', anchor: 'Sanskrit', hLevel: 2, number: '2' },
  ]
  const line = (word: string, href: string, label = 'Urdu spelling') =>
    `<p><strong class="headword" lang="hi">${word}</strong> (<i>plural</i> <b lang="hi"><a href="/wiki/किताबें#Hindi">किताबें</a></b>, <i>${label}</i> <b lang="ur"><a href="${href}">کِتاب</a></b>)</p>`
  const html = `<h2 id="Hindi">Hindi</h2><h3 id="E1">Etymology 1</h3>${line('किताब', '/wiki/کتاب#Urdu')}<h3 id="E2">Etymology 2</h3>${line('किताबें', '/wiki/کتابیں#Urdu')}<h2 id="Sanskrit">Sanskrit</h2>${line('किताब', '/wiki/غلط#Urdu')}`
  const groups = extractWiktionaryEntryGroups(html, sections, 'Hindi', /^Etymology/, 'किताब')
  expect(groups.map((group) => group.counterparts)).toEqual([
    [{ word: 'کتاب', language: 'ur' }],
    undefined,
  ])
  for (const [href, label] of [
    ['/wiki/کتاب#Hindi', 'Urdu spelling'],
    ['https://example.test/wiki/کتاب#Urdu', 'Urdu spelling'],
    ['/wiki/کتاب#Urdu', 'cognate'],
    ['/wiki/%zz#Urdu', 'Urdu spelling'],
  ]) {
    const invalid = `<h2 id="Hindi">Hindi</h2>${line('किताब', href, label)}`
    expect(
      extractWiktionaryEntryGroups(invalid, sections.slice(0, 1), 'Hindi', /^Etymology/, 'किताब')[0]
        .counterparts
    ).toBeUndefined()
  }
})

test('validated page identity binds one vocalized Urdu headword without folding arbitrary queries', () => {
  const sections = [{ index: '1', line: 'Urdu', anchor: 'Urdu', hLevel: 2, number: '1' }]
  const line =
    '<p><strong class="headword" lang="ur">کِتاب</strong> (<i>Hindi spelling</i> <b lang="hi"><a href="/wiki/किताब#Hindi">किताब</a></b>)</p>'
  const html = `<h2 id="Urdu">Urdu</h2>${line}`
  expect(
    extractWiktionaryEntryGroups(html, sections, 'Urdu', /^Etymology/, 'کتاب')[0].counterparts
  ).toBeUndefined()
  expect(
    extractWiktionaryEntryGroups(html, sections, 'Urdu', /^Etymology/, 'کتاب', {
      title: 'کتاب',
      edition: 'en',
    })[0].counterparts
  ).toEqual([{ word: 'किताब', language: 'hi' }])
  expect(
    extractWiktionaryEntryGroups(html + line, sections, 'Urdu', /^Etymology/, 'کتاب', {
      title: 'کتاب',
      edition: 'en',
    })[0].counterparts
  ).toBeUndefined()
})

test('romanization links require the exact Latin headword and an explicit selected-language relation', () => {
  const sections = [
    { index: '1', line: 'Japanese', anchor: 'Japanese', hLevel: 2, number: '1' },
    { index: '2', line: 'Romanization', anchor: 'Romanization', hLevel: 3, number: '1.1' },
    { index: '3', line: 'English', anchor: 'English', hLevel: 2, number: '2' },
  ]
  const html =
    '<h2 id="Japanese">Japanese</h2><h3 id="Romanization">Romanization</h3><p><strong class="Latn headword" lang="ja">tsunami</strong></p><ol><li><span class="form-of-definition use-with-mention"><a href="/wiki/romaji">Rōmaji</a> transcription of <span class="form-of-definition-link"><i lang="ja"><a href="/wiki/つなみ#Japanese">つなみ</a></i></span></span></li></ol><h2 id="English">English</h2>'
  expect(extractWiktionaryRomanizations(html, sections, 'tsunami')).toEqual([
    { word: 'つなみ', language: 'ja' },
  ])
  const nestedSpans = html
    .replace('<i lang="ja">', '<span lang="ja">')
    .replace('</i>', '</span>')
    .replace(
      '</span></span></li>',
      '</span><span lang="ja"><a href="/wiki/海嘯#Japanese">海嘯</a></span></span></li>'
    )
  expect(extractWiktionaryRomanizations(nestedSpans, sections, 'tsunami')).toEqual([
    { word: 'つなみ', language: 'ja' },
  ])
  expect(extractWiktionaryRomanizations(html, sections, 'pani')).toEqual([])
  expect(
    extractWiktionaryRomanizations(
      html.replace('transcription of', 'related to'),
      sections,
      'tsunami'
    )
  ).toEqual([])
  expect(
    extractWiktionaryRomanizations(
      html.replace('lang="ja"><a', 'lang="hi"><a'),
      sections,
      'tsunami'
    )
  ).toEqual([])
  expect(extractWiktionaryRomanizations(html, sections.slice(2), 'tsunami')).toEqual([])
})

test('Japanese alternative spellings stay within their source history', () => {
  const sections = [
    { index: '1', line: 'Japanese', anchor: 'Japanese', hLevel: 2, number: '1' },
    { index: '2', line: 'Alternative spellings', anchor: 'Alternatives', hLevel: 3, number: '1.1' },
    { index: '3', line: 'Etymology', anchor: 'Etymology', hLevel: 3, number: '1.2' },
  ]
  const html =
    '<h2 id="Japanese">Japanese</h2><h3 id="Alternatives">Alternative spellings</h3><ul><li><span lang="ja"><a href="/wiki/つなみ#Japanese">つなみ</a></span></li></ul><h3 id="Etymology">Etymology</h3><p><strong class="headword" lang="ja">津波</strong></p>'
  expect(
    extractWiktionaryEntryGroups(html, sections, 'Japanese', /^Etymology/, '津波')[0].counterparts
  ).toEqual([{ word: 'つなみ', language: 'ja' }])
})

test('Japanese publisher spelling tables retain only their labelled history targets', () => {
  const sections = [
    { index: '1', line: 'Japanese', anchor: 'Japanese', hLevel: 2, number: '1' },
    { index: '2', line: 'Etymology 1', anchor: 'E1', hLevel: 3, number: '1.1' },
    { index: '3', line: 'Etymology 2', anchor: 'E2', hLevel: 3, number: '1.2' },
  ]
  const table = (word: string) =>
    `<table class="wikitable floatright"><tbody><tr><th style="font-weight:normal">Alternative spellings\n</th></tr><tr><td style="text-align:center;font-size:108%"><span class="Jpan" lang="ja" style="font-size:140%"><a href="/wiki/${word}#Japanese">${word}</a></span> <small><a href="/wiki/Appendix:Glossary#rare">rare</a></small></td></tr></tbody></table>`
  const headword = '<p><strong class="headword" lang="ja">パン</strong></p>'
  const unrelated =
    '<table><tr><th>Related terms</th></tr><tr><td><span lang="ja"><a href="/wiki/食パン#Japanese">食パン</a></span></td></tr></table>'
  const redirectDefinitions =
    '<table class="ja-see"><tr><td><b>For pronunciation and definitions of パン – see the following entry.</b></td><td><span lang="ja">【<a href="/wiki/ぱん#Japanese">ぱん</a>】</span></td></tr><tr><td><span lang="ja"><a href="/wiki/無関係#Japanese">無関係</a></span></td></tr></table>'
  const html = `<h2 id="Japanese">Japanese</h2><h3 id="E1">Etymology 1</h3>${table('麵麭')}${headword}${unrelated}${redirectDefinitions}<h3 id="E2">Etymology 2</h3>${table('麺包')}${headword}`
  expect(
    extractWiktionaryEntryGroups(html, sections, 'Japanese', /^Etymology/, 'パン').map(
      (group) => group.counterparts
    )
  ).toEqual([
    [
      { word: '麵麭', language: 'ja' },
      { word: 'ぱん', language: 'ja' },
    ],
    [{ word: '麺包', language: 'ja' }],
  ])
})

test('recorded Japanese formulas retain their subject and the source-tagged component languages', () => {
  const relations = (key: 'ja-denwa' | 'ja-consento' | 'ja-salaryman') => {
    const fixture = japaneseFixtures[key]
    return extractWiktionaryEntryGroups(
      fixture.html,
      fixture.sections,
      fixture.language,
      /^Etymology/,
      fixture.word
    )[0].relations!
  }
  const denwa = relations('ja-denwa')
  expect(denwa.map(({ subject, target, relation }) => ({ subject, target, relation }))).toEqual([
    {
      subject: { word: '電話', language: 'Japanese' },
      target: { word: '電', language: 'Japanese' },
      relation: 'compound_from',
    },
    {
      subject: { word: '電話', language: 'Japanese' },
      target: { word: '話', language: 'Japanese' },
      relation: 'compound_from',
    },
  ])
  expect(denwa[0].snippet).toContain('Coined in Japanese as a compound of Chinese-derived 電')
  const clipping = relations('ja-consento')
  expect(
    clipping.map(({ subject, target, relation }) => [
      subject.word,
      target.word,
      target.language,
      relation,
    ])
  ).toEqual([
    ['コンセント', 'コンセントリックプラグ', 'Japanese', 'derived_from'],
    ['コンセントリックプラグ', 'concentric', 'English', 'compound_from'],
    ['コンセントリックプラグ', 'plug', 'English', 'compound_from'],
  ])
  const salaryman = relations('ja-salaryman')
  expect(salaryman.map(({ target, relation }) => [target.word, target.language, relation])).toEqual(
    [
      ['salaried man', 'English', 'derived_from'],
      ['サラリー', 'Japanese', 'compound_from'],
      ['マン', 'Japanese', 'compound_from'],
    ]
  )
})

test('recorded ruby annotations preserve headword and component spelling identities', () => {
  const fixture = japaneseFixtures['ja-denwa']
  const [group] = extractWiktionaryEntryGroups(
    fixture.html,
    fixture.sections,
    'Japanese',
    /^Etymology/,
    fixture.word
  )
  expect(group.transliteration).toBe('denwa')
  const tsunami = japaneseFixtures['ja-tsunami']
  const [compound] = extractWiktionaryEntryGroups(
    tsunami.html,
    tsunami.sections,
    'Japanese',
    /^Etymology/,
    tsunami.word
  )
  expect(compound.relations?.map(({ target }) => target.word)).toEqual(['津', '波'])
  const lemma = tsunami.html + '<ol><li>A tsunami, a tidal wave.</li></ol>'
  expect(isWiktionarySpellingLemma(lemma, tsunami.sections, 'Japanese', '津波', '津波')).toBe(true)
  for (const [html, requested, resolved] of [
    [lemma, '津波', '津浪'],
    [lemma, 'つなみ', 'つなみ'],
    [
      lemma.replace(
        '<ol>',
        '<ol><li><span class="form-of-definition">form of another word</span></li>'
      ),
      '津波',
      '津波',
    ],
    [lemma + '<p><strong class="headword" lang="ja">津波</strong></p>', '津波', '津波'],
    [lemma + '<h3>Etymology 2</h3>', '津波', '津波'],
  ]) {
    expect(isWiktionarySpellingLemma(html, tsunami.sections, 'Japanese', requested, resolved)).toBe(
      false
    )
  }
  const reading = japaneseFixtures['ja-tsunami-reading']
  expect(
    isWiktionarySpellingLemma(reading.html, reading.sections, 'Japanese', 'つなみ', 'つなみ')
  ).toBe(false)
})

test('term formulas in definitions do not become entry etymology relations', () => {
  const fixture = japaneseFixtures['ja-denwa']
  const etymologyBody = fixture.html.slice(
    fixture.html.indexOf('<p>'),
    fixture.html.indexOf(`<h3 id="${fixture.sections[2].anchor}"`)
  )
  const html =
    fixture.html.slice(0, fixture.html.indexOf('<p>')) + '<h3 id="Noun">Noun</h3>' + etymologyBody
  const sections = [
    ...fixture.sections.slice(0, 2),
    { index: '3', line: 'Noun', anchor: 'Noun', hLevel: 3, number: '3' },
  ]
  const [group] = extractWiktionaryEntryGroups(
    html,
    sections,
    'Japanese',
    /^Etymology/,
    fixture.word
  )
  expect(group.relations).toBeUndefined()
  expect(group.etymologyText).toBe('')
  expect(group.text).toContain('Coined in Japanese as a compound')
})

test('rejected analyses and quoted comparisons do not establish component relations', () => {
  const fixture = japaneseFixtures['ja-denwa']
  const formula = '<i lang="ja">電</i> + <i lang="ja">話</i>'
  const html = `<h2 id="Japanese">Japanese</h2><h3 id="Etymology_2">Etymology</h3>
    <p>Not a compound of ${formula}.</p>
    <p>Compare the quoted explanation “compound of ${formula}”.</p>`
  expect(
    extractWiktionaryEntryGroups(
      html,
      fixture.sections.slice(0, 2),
      'Japanese',
      /^Etymology/,
      fixture.word
    )[0].relations
  ).toBeUndefined()
})

test('Japanese pronunciation redirects retain every primary entry and require whole-section identity', () => {
  const fixture = japaneseFixtures['ja-tsunami-reading']
  expect(extractWiktionaryVariants(fixture.html, fixture.sections, 'Japanese')).toEqual([
    {
      word: '津波',
      relationship: 'redirect',
      url: 'https://en.wiktionary.org/wiki/%E6%B4%A5%E6%B3%A2#Japanese',
    },
  ])
  expect(extractWiktionaryVariants(fixture.html, fixture.sections, 'English')).toEqual([])
  expect(
    extractWiktionarySpellingRedirect(fixture.html, fixture.sections, 'Japanese', 'つなみ')
  ).toEqual({ word: '津波', language: 'ja', kind: 'spelling' })
  const ambiguous = fixture.html.replace(
    '</td></tr></tbody></table>',
    '</td></tr><tr><td><span lang="ja">【<a href="/wiki/橋#Japanese">橋</a>】</span></td></tr></tbody></table>'
  )
  expect(
    extractWiktionaryVariants(ambiguous, fixture.sections, 'Japanese').map(({ word }) => word)
  ).toEqual(['津波', '橋'])
  expect(
    extractWiktionarySpellingRedirect(ambiguous, fixture.sections, 'Japanese', 'つなみ')
  ).toBeUndefined()
  const ambiguousBracket = fixture.html.replace(
    '</a>】',
    '</a><a href="/wiki/橋#Japanese">橋</a>】'
  )
  expect(
    extractWiktionarySpellingRedirect(ambiguousBracket, fixture.sections, 'Japanese', 'つなみ')
  ).toBeUndefined()
  expect(
    extractWiktionarySpellingRedirect(
      fixture.html +
        '<p><strong class="headword" lang="ja">つなみ</strong></p><ol><li>An independent sense.</li></ol>',
      fixture.sections,
      'Japanese',
      'つなみ'
    )
  ).toBeUndefined()
  for (const ignored of ['<!-- ignored -->', '<h3>Pronunciation</h3>']) {
    expect(
      extractWiktionarySpellingRedirect(
        fixture.html + `<scr${ignored}ipt>An independent sense.</script>`,
        fixture.sections,
        'Japanese',
        'つなみ'
      )
    ).toBeUndefined()
  }
})

test('whole-entry form redirects require one explicit same-language spelling definition', () => {
  const sections = [{ index: '1', line: 'Japanese', anchor: 'Japanese', hLevel: 2, number: '1' }]
  const html =
    '<h2 id="Japanese">Japanese</h2><p><strong class="headword" lang="ja">こんにちわ</strong></p><ol><li><span class="form-of-definition">misspelling of <span class="form-of-definition-link"><i lang="ja"><a href="/wiki/こんにちは#Japanese">こんにちは</a></i></span></span></li></ol>'
  expect(extractWiktionarySpellingRedirect(html, sections, 'Japanese', 'こんにちわ')).toEqual({
    word: 'こんにちは',
    language: 'ja',
    kind: 'misspelling',
  })
  for (const invalid of [
    html.replace('</ol>', '<li>An independent meaning.</li></ol>'),
    html.replace('misspelling of', 'related to'),
    html.replace('lang="ja"><a', 'lang="hi"><a'),
    html.replace('<p>', '<h3>Etymology 1</h3><h3>Etymology 2</h3><p>'),
  ]) {
    expect(
      extractWiktionarySpellingRedirect(invalid, sections, 'Japanese', 'こんにちわ')
    ).toBeUndefined()
  }
})

describe('extractWiktionaryEntryGroups', () => {
  test('attaches only exact headword readings within each selected history', () => {
    const html = [
      '<h2 id="Hindi">Hindi</h2>',
      '<h3 id="Etymology_1">Etymology 1</h3>',
      '<p>From Sanskrit <span class="tr">wrong ancestor reading</span>.</p>',
      '<p><strong class="Deva headword" lang="hi">पानी</strong> (<span class="headword-tr tr">pānī</span>)</p>',
      '<h3 id="Etymology_2">Etymology 2</h3>',
      '<p><strong class="headword Deva" lang="hi">पानी</strong> (<span class="headword-tr tr">pāni</span>)</p>',
      '<h2 id="Sanskrit">Sanskrit</h2>',
      '<p><strong class="headword">पानी</strong> (<span class="headword-tr tr">wrong language</span>)</p>',
    ].join('')
    const sections = ['Hindi', 'Etymology_1', 'Etymology_2', 'Sanskrit'].map((anchor, index) => ({
      index: String(index),
      number: String(index),
      anchor,
      line: anchor.replace('_', ' '),
      hLevel: anchor.startsWith('Etymology') ? 3 : 2,
    }))
    expect(
      extractWiktionaryEntryGroups(html, sections, 'Hindi', /^Etymology/, 'पानी').map(
        (group) => group.transliteration
      )
    ).toEqual(['pānī', 'pāni'])
    expect(
      extractWiktionaryEntryGroups(html, sections, 'Hindi', /^Etymology/, 'पाणि').every(
        (group) => group.transliteration === undefined
      )
    ).toBe(true)
    const conflicting = html.replace(
      '<h3 id="Etymology_2">',
      '<p><strong class="headword">पानी</strong> (<span class="headword-tr tr">other reading</span>)</p><h3 id="Etymology_2">'
    )
    expect(
      extractWiktionaryEntryGroups(conflicting, sections, 'Hindi', /^Etymology/, 'पानी')[0]
        .transliteration
    ).toBeUndefined()
  })

  test('keeps numbered etymologies and their sense contexts separate', () => {
    const html = [
      '<h2 id="English">English</h2><p>unrelated same spelling</p>',
      '<h2 id="Italian">Italian</h2>',
      '<h3 id="Etymology_1">Etymology 1</h3><p>From Latin <i>vītis</i>, vine.</p>',
      '<h4 id="Noun_1">Noun</h4><ol><li>screw</li><li>vine</li></ol>',
      '<h3 id="Etymology_2">Etymology 2</h3><p>See <i>vita</i>, life.</p>',
      '<h4 id="Noun_2">Noun</h4><p>plural of <i>vita</i></p>',
      '<h2 id="Latin">Latin</h2><p>wrong language section</p>',
    ].join('')
    const sections: WiktionaryTocSection[] = [
      { index: '1', line: 'English', anchor: 'English', hLevel: 2, number: '1' },
      { index: '2', line: 'Italian', anchor: 'Italian', hLevel: 2, number: '2' },
      {
        index: '3',
        line: 'Etymology 1',
        anchor: 'Etymology_1',
        hLevel: 3,
        number: '2.1',
      },
      { index: '4', line: 'Noun', anchor: 'Noun_1', hLevel: 4, number: '2.1.1' },
      {
        index: '5',
        line: 'Etymology 2',
        anchor: 'Etymology_2',
        hLevel: 3,
        number: '2.2',
      },
      { index: '6', line: 'Noun', anchor: 'Noun_2', hLevel: 4, number: '2.2.1' },
      { index: '7', line: 'Latin', anchor: 'Latin', hLevel: 2, number: '3' },
    ]

    const groups = extractWiktionaryEntryGroups(
      html,
      sections,
      'Italian',
      /^Etymology(?:\s+\d+)?$/i
    )

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      index: '3',
      number: '2.1',
      heading: 'Etymology 1',
      anchor: 'Etymology_1',
    })
    expect(groups[0].text).toContain('vītis')
    expect(groups[0].text).toContain('screw')
    expect(groups[0].etymologyText).toBe('From Latin vītis, vine.')
    expect(groups[0].text).not.toContain('plural of vita')
    expect(groups[0].sections[0]).toMatchObject({
      heading: 'Noun',
      anchor: 'Noun_1',
      path: ['Noun'],
    })

    expect(groups[1].text).toContain('plural of vita')
    expect(groups[1].text).not.toContain('vītis')
    expect(groups[1].text).not.toContain('wrong language section')
  })

  test('preserves same-level native POS and form sections as distinct contexts', () => {
    const html = [
      '<h2 id="Italiano">Italiano</h2>',
      '<h3 id="Etimologia">Etimologia</h3><p>Dal latino <i>vītis</i>.</p>',
      '<h3 id="Sostantivo">Sostantivo</h3><p>Pianta rampicante; elemento filettato.</p>',
      '<h4 id="Significati">Significati</h4><ol><li>vite da uva</li><li>vite metallica</li></ol>',
      '<h3 id="Forma_flessa">Forma flessa</h3><p>Plurale di <i>vita</i>.</p>',
      '<h2 id="Altro">Altro</h2><p>testo estraneo</p>',
    ].join('')
    const sections: WiktionaryTocSection[] = [
      { index: '1', line: '<span>Italiano</span>', anchor: 'Italiano', level: '2', number: '1' },
      { index: '2', line: 'Etimologia', anchor: 'Etimologia', level: '3', number: '1.1' },
      { index: '3', line: 'Sostantivo', anchor: 'Sostantivo', level: '3', number: '1.2' },
      { index: '4', line: 'Significati', anchor: 'Significati', level: '4', number: '1.2.1' },
      {
        index: '5',
        line: 'Forma flessa',
        anchor: 'Forma_flessa',
        level: '3',
        number: '1.3',
      },
      { index: '6', line: 'Altro', anchor: 'Altro', level: '2', number: '2' },
    ]

    const [group] = extractWiktionaryEntryGroups(
      html,
      sections,
      'Italiano',
      /^Etimologia(?:\s+\d+)?$/i
    )

    expect(group.heading).toBe('Etimologia')
    expect(group.sections.map((section) => section.heading)).toEqual([
      'Sostantivo',
      'Significati',
      'Forma flessa',
    ])
    expect(group.sections[0].text).toBe('Sostantivo\nPianta rampicante; elemento filettato.')
    expect(group.sections[1]).toMatchObject({
      path: ['Sostantivo', 'Significati'],
      text: 'Significati\n- vite da uva\n- vite metallica',
    })
    expect(group.sections[2]).toMatchObject({
      path: ['Forma flessa'],
      text: 'Forma flessa\nPlurale di vita.',
    })
    expect(group.text).not.toContain('testo estraneo')
  })

  test('falls back to one structured language group when no etymology heading exists', () => {
    const html =
      '<h2 id="Italiano">Italiano</h2><h3 id="Sostantivo">Sostantivo</h3><p>Una definizione.</p><h2 id="English">English</h2><p>Not selected.</p>'
    const sections: WiktionaryTocSection[] = [
      { index: '1', line: 'Italiano', anchor: 'Italiano', level: '2', number: '1' },
      { index: '2', line: 'Sostantivo', anchor: 'Sostantivo', level: '3', number: '1.1' },
      { index: '3', line: 'English', anchor: 'English', level: '2', number: '2' },
    ]

    const groups = extractWiktionaryEntryGroups(
      html,
      sections,
      'Italiano',
      /^Etimologia(?:\s+\d+)?$/i
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ heading: 'Italiano', index: '1', anchor: 'Italiano' })
    expect(groups[0].sections[0].text).toContain('Una definizione.')
    expect(groups[0].etymologyText).toBeUndefined()
    expect(groups[0].text).not.toContain('Not selected.')
  })

  test('rejects pages without the selected language section', () => {
    expect(
      extractWiktionaryEntryGroups(
        '<h2 id="English">English</h2><p>Only English.</p>',
        [{ index: '1', line: 'English', anchor: 'English', level: '2', number: '1' }],
        'Italiano',
        /^Etimologia$/i
      )
    ).toEqual([])
  })

  test('cleans formatting while retaining list and numeric-entity sense text', () => {
    expect(
      cleanWiktionaryHtml(
        '<h3>Nom</h3><ol><li>fen&#234;tre &amp; ouverture</li><li>cadre&nbsp;vitré</li></ol><sup>[1]</sup>'
      )
    ).toBe('Nom\n- fenêtre & ouverture\n- cadre vitré')
  })
})

test('regional spelling lists keep their local heading and selected-language boundary', () => {
  const html = [
    '<h2 id="English">English</h2>',
    '<h3 id="Alternative_forms">Alternative forms</h3>',
    '<p>A discussion with an unrelated link to <a href="/wiki/hue">hue</a>.</p>',
    '<p>US spelling: <a href="/wiki/color">color</a></p>',
    '<h3 id="Noun">Noun</h3>',
    '<p>US spelling: <a href="/wiki/unrelated">unrelated</a></p>',
    '<h2 id="French">French</h2>',
    '<h3 id="Alternative_forms_2">Alternative forms</h3>',
    '<p>US spelling: <a href="/wiki/other-language">other-language</a></p>',
  ].join('')
  const sections = ['English', 'Alternative_forms', 'Noun', 'French', 'Alternative_forms_2'].map(
    (anchor, index) => ({
      index: String(index),
      anchor,
      number: String(index),
      line: anchor.startsWith('Alternative') ? 'Alternative forms' : anchor,
      hLevel: anchor === 'English' || anchor === 'French' ? 2 : 3,
    })
  )
  expect(extractWiktionaryVariants(html, sections, 'English')).toEqual([
    {
      word: 'color',
      relationship: 'spelling-variant',
      url: 'https://en.wiktionary.org/wiki/color',
    },
  ])
})

function fixture(
  language: Exclude<LanguageCode, 'en'>,
  languageHeading: string,
  etymologyHeading: string
) {
  const html = `<h2 id="other">Other</h2><p>wrong language</p><h2 id="lang">${languageHeading}</h2><h3 id="ety1">${etymologyHeading}</h3><p>Dal latino casa, dimora.</p><h3 id="ety2">${etymologyHeading} 2</h3><p>De latin casa, habitation.</p><h2 id="next">Next</h2>`
  const sections = [
    { index: '1', line: 'Other', anchor: 'other', level: '2', number: '1' },
    { index: '2', line: languageHeading, anchor: 'lang', level: '2', number: '2' },
    { index: '3', line: etymologyHeading, anchor: 'ety1', level: '3', number: '2.1' },
    { index: '4', line: `${etymologyHeading} 2`, anchor: 'ety2', level: '3', number: '2.2' },
    { index: '5', line: 'Next', anchor: 'next', level: '2', number: '3' },
  ]
  return extractWiktionaryEntryGroups(
    html,
    sections,
    languageHeading,
    LANGUAGES[language].nativeWiktionary!.etymologyHeading
  )
}

describe('MediaWiki tocdata language sections', () => {
  test.each([
    ['it', 'Italiano', 'Etimologia'],
    ['es', 'Español', 'Etimología'],
    ['fr', 'Français', 'Étymologie'],
    ['pt', 'Português', 'Etimologia'],
  ] as const)(
    '%s selects the requested language and all numbered etymologies',
    (code, language, heading) => {
      const groups = fixture(code, language, heading)
      expect(groups).toHaveLength(2)
      const text = groups.map((group) => group.text).join('\n')
      expect(groups[0].text).toContain('latino casa')
      expect(text).toContain('latin casa')
      expect(text).not.toContain('wrong language')
    }
  )

  test('accepts live tocdata hLevel fields and HTML-wrapped headings', () => {
    const groups = extractWiktionaryEntryGroups(
      '<h2 id="Italiano">Italiano</h2><h3 id="Etimologia_/_Derivazione">Etimologia / Derivazione</h3><p>Dal latino casa.</p>',
      [
        {
          index: '1',
          line: '<span>Italiano</span>',
          anchor: 'Italiano',
          hLevel: 2,
          number: '1',
        },
        {
          index: 'T-1',
          line: 'Etimologia / Derivazione',
          anchor: 'Etimologia_/_Derivazione',
          hLevel: 3,
          number: '1.1',
        },
      ],
      'Italiano',
      LANGUAGES.it.nativeWiktionary!.etymologyHeading
    )
    expect(groups[0].text).toContain('latino casa')
  })
})
