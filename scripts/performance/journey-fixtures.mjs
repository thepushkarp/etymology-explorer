// Synthetic UI evidence: these entries exercise navigation, not etymological accuracy.
export function journeyEntry(word, definitions) {
  const entries = Object.fromEntries(
    Object.entries(definitions).map(([language, meanings]) => {
      const histories = meanings.map(([label, pronunciation], index) => ({
        id: `history:${language}:${word}:${index}`,
        label,
        entryKind: 'lemma',
        queryNodeId: `query:${language}:${word}:${index}`,
        lemmaNodeId: `query:${language}:${word}:${index}`,
        evidenceScopeIds: [`scope:${language}:${word}:${index}`],
        pronunciation,
        definition: `${label} (journey fixture).`,
        roots: [],
        ancestryGraph: { branches: [] },
        lore: `Synthetic story for ${label}.`,
      }))
      return [
        language,
        {
          ...histories[0],
          word,
          language,
          primaryHistoryId: histories[0].id,
          histories,
          sources: histories.map((history, index) => ({
            name: 'wiktionaryEnglish',
            url: `https://example.invalid/${word}/${language}/${index}`,
            word,
            historyIds: [history.id],
          })),
          suggestions: { seeAlso: ['journeyrelated'] },
        },
      ]
    })
  )
  return {
    word,
    entries,
    languages: Object.keys(entries),
    attemptedLanguages: Object.keys(entries),
    otherLanguages: [],
    tracedAt: new Date().toISOString(),
    revision: 0,
  }
}

const englishMamushi = journeyEntry('mamushi', { en: [['English viper entry', '/test/']] })
englishMamushi.otherScripts = [{ word: 'まむし', language: 'ja' }]
const japaneseMamushi = journeyEntry('まむし', { ja: [['Japanese viper entry', '/test/']] })
japaneseMamushi.entries.ja.histories[0].transliteration = 'mamushi'
japaneseMamushi.entries.ja.transliteration = 'mamushi'

const kouForms = ['甲', '校', '工', '公', '高', '光']
const kouIndex = journeyEntry('こう', { ja: [['Kou reading fixture', '/koː/']] })
kouIndex.entries.ja.histories[0].transliteration = 'kō'
kouIndex.entries.ja.histories[0].counterparts = kouForms.map((word) => ({ word, language: 'ja' }))
const kouEntries = kouForms.map((word) => {
  const entry = journeyEntry(word, { ja: [[`Kou ${word} fixture`, '/koː/']] })
  entry.entries.ja.histories[0].transliteration = word === '甲' ? 'kabuto' : 'kō'
  return entry
})

const kakiIndex = journeyEntry('かき', { ja: [['Saved kaki reading index', '/kaki/']] })
Object.assign(kakiIndex.entries.ja.histories[0], {
  entryKind: 'unresolved',
  transliteration: 'kaki',
  counterparts: [
    { word: '柿', language: 'ja' },
    { word: '牡蠣', language: 'ja' },
  ],
})

const haruIndex = journeyEntry('はる', { ja: [['Haru reading index', '/haru/']] })
Object.assign(haruIndex.entries.ja.histories[0], {
  entryKind: 'unresolved',
  transliteration: 'haru',
  counterparts: [
    { word: '春', language: 'ja' },
    { word: '張る', language: 'ja' },
  ],
})
const spring = journeyEntry('春', {
  ja: [
    ['Cached spring meaning', '/haru/'],
    ['Second spring history', '/haru/'],
  ],
})
for (const history of spring.entries.ja.histories) history.transliteration = 'haru'
const romanHaru = journeyEntry('haru', { en: [['Independent Latin spelling fixture', '/test/']] })
romanHaru.otherScripts = [{ word: 'はる', language: 'ja' }]

export const journeyEntries = [
  romanHaru,
  haruIndex,
  spring,
  kakiIndex,
  kouIndex,
  ...kouEntries,
  englishMamushi,
  japaneseMamushi,
  journeyEntry('mole', {
    en: [
      ['Burrowing animal', '/məʊl/'],
      ['Skin mark', '/məʊl/'],
    ],
    es: [['Sauce', '/ˈmole/']],
  }),
  journeyEntry('あめ', {
    ja: [
      ['Rain', '/ame/'],
      ['Candy', '/ame/'],
    ],
  }),
  journeyEntry('journeyrelated', { en: [['Related entry', '/test/']] }),
]
