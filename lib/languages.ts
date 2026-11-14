import { canonicalizeWord } from './orthography'
export const SUPPORTED_LANGUAGE_CODES = [
  'en',
  'it',
  'es',
  'fr',
  'pt',
  'hi',
  'ur',
  'sa',
  'ja',
] as const

export const ETYMOLOGY_STRATA = [
  'wago',
  'kango',
  'gairaigo',
  'wasei-eigo',
  'wasei-kango',
  'hybrid',
] as const
export type EtymologyStratum = (typeof ETYMOLOGY_STRATA)[number]

export type LanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number]

export type ScriptId = 'Latin' | 'Devanagari' | 'Arabic' | 'Han' | 'Hiragana' | 'Katakana'

export interface LanguageDefinition {
  code: LanguageCode
  englishName: string
  nativeName: string
  scripts: readonly ScriptId[]
  priority: number
  englishWiktionaryHeading: string
  nativeWiktionary?: {
    edition: string
    heading: string
    etymologyHeading: RegExp
    formHeading: RegExp
  }
  historyPrimary: 'native' | 'english'
  spellingIdentity?: boolean
  wikipediaEdition?: string
  wikidataEntity?: string
  freeDictionary?: boolean
  ngramCorpus: string | null
  ttsLanguageCode?: string
  direction?: 'rtl'
  particles: readonly string[]
  /** Language-specific synthesis rules appended to the system prompt. */
  promptNotes?: string
}

export const LANGUAGES: Record<LanguageCode, LanguageDefinition> = {
  en: {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
    scripts: ['Latin'],
    priority: 0,
    nativeWiktionary: {
      edition: 'en',
      heading: 'English',
      etymologyHeading: /^Etymology(?:\s+\d+)?$/i,
      formHeading: /^(?:Noun|Verb|Adjective|Adverb|Pronoun|Participle)$/i,
    },
    historyPrimary: 'native',
    wikipediaEdition: 'en',
    wikidataEntity: 'Q1860',
    freeDictionary: true,
    ttsLanguageCode: 'en',
    particles: ['the', 'of', 'and', 'a', 'an'],
    englishWiktionaryHeading: 'English',
    ngramCorpus: 'eng-2019',
  },
  it: {
    code: 'it',
    englishName: 'Italian',
    nativeName: 'Italiano',
    scripts: ['Latin'],
    priority: 1,
    nativeWiktionary: {
      edition: 'it',
      heading: 'Italiano',
      etymologyHeading: /^Etimologia(?:\s*\/\s*Derivazione)?(?:\s+\d+)?$/i,
      formHeading: /^(?:Forma flessa|Voce verbale|Participio|Coniugazione)/i,
    },
    historyPrimary: 'native',
    wikipediaEdition: 'it',
    wikidataEntity: 'Q652',
    freeDictionary: true,
    ttsLanguageCode: 'it',
    particles: ['di', 'da', 'del', 'della', 'il', 'lo', 'la', 'e'],
    englishWiktionaryHeading: 'Italian',
    ngramCorpus: 'ita-2019',
  },
  es: {
    code: 'es',
    englishName: 'Spanish',
    nativeName: 'Español',
    scripts: ['Latin'],
    priority: 2,
    nativeWiktionary: {
      edition: 'es',
      heading: 'Español',
      etymologyHeading: /^Etimología(?:\s+\d+)?$/i,
      formHeading: /^(?:Forma verbal|Forma nominal|Participio|Conjugación)/i,
    },
    historyPrimary: 'native',
    wikipediaEdition: 'es',
    wikidataEntity: 'Q1321',
    freeDictionary: true,
    ttsLanguageCode: 'es',
    particles: ['de', 'del', 'la', 'el', 'los', 'las', 'y'],
    englishWiktionaryHeading: 'Spanish',
    ngramCorpus: 'spa-2019',
  },
  fr: {
    code: 'fr',
    englishName: 'French',
    nativeName: 'Français',
    scripts: ['Latin'],
    priority: 3,
    nativeWiktionary: {
      edition: 'fr',
      heading: 'Français',
      etymologyHeading: /^Étymologie(?:\s+\d+)?$/i,
      formHeading: /^Forme de /i,
    },
    historyPrimary: 'native',
    wikipediaEdition: 'fr',
    wikidataEntity: 'Q150',
    freeDictionary: true,
    ttsLanguageCode: 'fr',
    particles: ['de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et'],
    englishWiktionaryHeading: 'French',
    ngramCorpus: 'fre-2019',
  },
  pt: {
    code: 'pt',
    englishName: 'Portuguese',
    nativeName: 'Português',
    scripts: ['Latin'],
    priority: 4,
    nativeWiktionary: {
      edition: 'pt',
      heading: 'Português',
      etymologyHeading: /^Etimologia(?:\s+\d+)?$/i,
      formHeading: /^(?:Forma verbal|Forma nominal|Particípio|Conjugação)/i,
    },
    historyPrimary: 'native',
    wikipediaEdition: 'pt',
    wikidataEntity: 'Q5146',
    freeDictionary: true,
    ttsLanguageCode: 'pt',
    particles: ['de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'e'],
    englishWiktionaryHeading: 'Portuguese',
    ngramCorpus: null,
    promptNotes:
      'PORTUGUESE: write the example sentences in neutral Portuguese. When a Brazilian/European distinction matters, label it explicitly; never silently choose one regional variant.',
  },
  hi: {
    code: 'hi',
    englishName: 'Hindi',
    nativeName: 'हिन्दी',
    scripts: ['Devanagari'],
    priority: 5,
    englishWiktionaryHeading: 'Hindi',
    nativeWiktionary: {
      edition: 'hi',
      heading: 'हिंदी',
      etymologyHeading: /^व्युत्पत्ति(?:\s+\d+)?$/u,
      formHeading: /^(?:संज्ञा|क्रिया|विशेषण)$/u,
    },
    historyPrimary: 'english',
    wikipediaEdition: 'hi',
    wikidataEntity: 'Q1568',
    ngramCorpus: null,
    ttsLanguageCode: 'hi',
    particles: ['का', 'की', 'के', 'और', 'में', 'से'],
    promptNotes:
      'HINDI: identify tatsama, tadbhava, or Perso-Arabic layers only when sources establish them. Hindi and Urdu are standardized registers of Hindustani written in different scripts; keep their source histories independent. A Sanskrit root marked √ is a root, not an attested word.',
  },
  ur: {
    code: 'ur',
    englishName: 'Urdu',
    nativeName: 'اردو',
    scripts: ['Arabic'],
    priority: 6,
    englishWiktionaryHeading: 'Urdu',
    historyPrimary: 'english',
    wikipediaEdition: 'ur',
    wikidataEntity: 'Q1617',
    ngramCorpus: null,
    ttsLanguageCode: 'ur',
    direction: 'rtl',
    particles: ['کا', 'کی', 'کے', 'اور', 'میں', 'سے'],
    promptNotes:
      'URDU: identify inherited Indic and Perso-Arabic layers only when sources establish them. Hindi and Urdu are standardized registers of Hindustani written in different scripts; keep their source histories independent. A Sanskrit root marked √ is a root, not an attested word.',
  },
  sa: {
    code: 'sa',
    englishName: 'Sanskrit',
    nativeName: 'संस्कृतम्',
    scripts: ['Devanagari'],
    priority: 7,
    englishWiktionaryHeading: 'Sanskrit',
    historyPrimary: 'english',
    wikipediaEdition: 'sa',
    wikidataEntity: 'Q11059',
    ngramCorpus: null,
    ttsLanguageCode: 'hi',
    particles: ['च', 'वा'],
    promptNotes:
      'SANSKRIT: distinguish source-attested words from grammatical roots marked √. Never present a root as an attested ancestor word. Preserve Vedic and Classical period distinctions when the sources make them.',
  },
  ja: {
    spellingIdentity: true,
    code: 'ja',
    englishName: 'Japanese',
    nativeName: '日本語',
    scripts: ['Han', 'Hiragana', 'Katakana'],
    priority: 8,
    englishWiktionaryHeading: 'Japanese',
    nativeWiktionary: {
      edition: 'ja',
      heading: '日本語',
      etymologyHeading: /^語源(?:\s*[0-9０-９]+)?$/u,
      formHeading: /^(?:名詞|動詞|形容詞)$/u,
    },
    historyPrimary: 'english',
    wikipediaEdition: 'ja',
    wikidataEntity: 'Q5287',
    ngramCorpus: null,
    ttsLanguageCode: 'ja',
    particles: ['の', 'に', 'は', 'を', 'と'],
    promptNotes:
      'JAPANESE: classify a history stratum only from affirmative scoped source evidence. A wasei-eigo construction is coined in Japanese, not a whole-word English borrowing. Preserve disputed borrowing and coinage accounts with attribution. Follow only source-attested, language-tagged components; do not split a source phrase or infer parts from a gloss. Kanji may be ateji: glyph origins are not word ancestry. A translation target is not an ancestor. JMdict source material with unspecified full/partial status cannot establish whole-word borrowing.',
  },
}

export function isLanguageCode(value: unknown): value is LanguageCode {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(value.toLowerCase())
  )
}

export function parseLanguageCode(value: string | null | undefined): LanguageCode | null {
  if (!value) return 'en'
  const normalized = value.toLowerCase()
  return SUPPORTED_LANGUAGE_CODES.find((code) => code === normalized) ?? null
}

export function wordPagePath(word: string, language?: LanguageCode): string {
  const normalizedWord = canonicalizeWord(word)
  const encodedWord = encodeURIComponent(normalizedWord)
  return !language ? `/word/${encodedWord}` : `/word/${language}/${encodedWord}`
}

export function lexemeKey(language: LanguageCode, word: string): string {
  return `${language}:${canonicalizeWord(word)}`
}

const SCRIPTS: readonly ScriptId[] = [
  'Latin',
  'Devanagari',
  'Arabic',
  'Han',
  'Hiragana',
  'Katakana',
]

/** Ignore punctuation and marks, but retain unsupported letters so mixed input cannot match. */
export function detectScripts(word: string): ScriptId[] {
  const letters = [...word].filter((letter) => /\p{L}/u.test(letter)).join('')
  return SCRIPTS.filter((script) =>
    new RegExp(`\\p{Script_Extensions=${script}}`, 'u').test(letters)
  )
}

export function candidateLanguages(word: string): LanguageCode[] {
  const letters = [...word].filter((letter) => /\p{L}/u.test(letter))
  if (
    !letters.length ||
    letters.some(
      (letter) =>
        !SCRIPTS.some((script) => new RegExp(`\\p{Script_Extensions=${script}}`, 'u').test(letter))
    )
  )
    return []
  const scripts = detectScripts(word)
  return Object.values(LANGUAGES)
    .filter((language) => scripts.every((script) => language.scripts.includes(script)))
    .sort((a, b) => a.priority - b.priority)
    .map((language) => language.code)
}

export function languageFromName(name: string): LanguageCode | undefined {
  const value = name.trim().toLowerCase()
  return Object.values(LANGUAGES).find(
    (language) => language.code === value || language.englishName.toLowerCase() === value
  )?.code
}

export function lexicalLanguageName(name: string): string {
  const language = languageFromName(name)
  if (language) return LANGUAGES[language].englishName
  return (
    ['Old English', 'Latin', 'Ancient Greek', 'Old Japanese'].find(
      (heading) => heading.toLowerCase() === name.trim().toLowerCase()
    ) ?? name.trim()
  )
}
