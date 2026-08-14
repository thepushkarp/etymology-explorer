export const SUPPORTED_LANGUAGE_CODES = ['en', 'it', 'es', 'fr', 'pt', 'ja'] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number]
/** Existing paired English/local beta editions. Japanese has a learner-specific result shape. */
export type BetaLanguageCode = 'it' | 'es' | 'fr' | 'pt'
export type JapaneseLanguageCode = 'ja'
export type NonEnglishLanguageCode = Exclude<LanguageCode, 'en'>

export const BETA_SYMBOL = 'β'

export interface LanguageDefinition {
  code: LanguageCode
  englishName: string
  nativeName: string
  nativeEtymologyLabel: string
  beta: boolean
  wiktionaryEdition: string
  englishWiktionaryHeading: string
  nativeWiktionaryHeading: string
  etymologyHeading: RegExp
  formHeading: RegExp
  ngramCorpus: string | null
}

export const LANGUAGES: Record<LanguageCode, LanguageDefinition> = {
  en: {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
    nativeEtymologyLabel: 'etymology',
    beta: false,
    wiktionaryEdition: 'en',
    englishWiktionaryHeading: 'English',
    nativeWiktionaryHeading: 'English',
    etymologyHeading: /^Etymology(?:\s+\d+)?$/i,
    formHeading: /^(?:Noun|Verb|Adjective|Adverb|Pronoun|Participle)$/i,
    ngramCorpus: 'eng-2019',
  },
  it: {
    code: 'it',
    englishName: 'Italian',
    nativeName: 'Italiano',
    nativeEtymologyLabel: 'etimologia',
    beta: true,
    wiktionaryEdition: 'it',
    englishWiktionaryHeading: 'Italian',
    nativeWiktionaryHeading: 'Italiano',
    etymologyHeading: /^Etimologia(?:\s*\/\s*Derivazione)?(?:\s+\d+)?$/i,
    formHeading: /^(?:Forma flessa|Voce verbale|Participio|Coniugazione)/i,
    ngramCorpus: 'ita-2019',
  },
  es: {
    code: 'es',
    englishName: 'Spanish',
    nativeName: 'Español',
    nativeEtymologyLabel: 'etimología',
    beta: true,
    wiktionaryEdition: 'es',
    englishWiktionaryHeading: 'Spanish',
    nativeWiktionaryHeading: 'Español',
    etymologyHeading: /^Etimología(?:\s+\d+)?$/i,
    formHeading: /^(?:Forma verbal|Forma nominal|Participio|Conjugación)/i,
    ngramCorpus: 'spa-2019',
  },
  fr: {
    code: 'fr',
    englishName: 'French',
    nativeName: 'Français',
    nativeEtymologyLabel: 'étymologie',
    beta: true,
    wiktionaryEdition: 'fr',
    englishWiktionaryHeading: 'French',
    nativeWiktionaryHeading: 'Français',
    etymologyHeading: /^Étymologie(?:\s+\d+)?$/i,
    formHeading: /^Forme de /i,
    ngramCorpus: 'fre-2019',
  },
  pt: {
    code: 'pt',
    englishName: 'Portuguese',
    nativeName: 'Português',
    nativeEtymologyLabel: 'etimologia',
    beta: true,
    wiktionaryEdition: 'pt',
    englishWiktionaryHeading: 'Portuguese',
    nativeWiktionaryHeading: 'Português',
    etymologyHeading: /^Etimologia(?:\s+\d+)?$/i,
    formHeading: /^(?:Forma verbal|Forma nominal|Particípio|Conjugação)/i,
    ngramCorpus: null,
  },
  ja: {
    code: 'ja',
    englishName: 'Japanese',
    nativeName: '日本語',
    nativeEtymologyLabel: '語源',
    beta: true,
    wiktionaryEdition: 'ja',
    englishWiktionaryHeading: 'Japanese',
    nativeWiktionaryHeading: '日本語',
    etymologyHeading: /^(?:語源|由来)(?:\s*\d+)?$/i,
    formHeading: /^(?:名詞|動詞|形容詞|副詞|助詞|助動詞|成句|連語)/,
    ngramCorpus: null,
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
  return isLanguageCode(normalized) ? normalized : null
}

export function isBetaLanguage(language: LanguageCode): language is BetaLanguageCode {
  return language === 'it' || language === 'es' || language === 'fr' || language === 'pt'
}

export function isJapaneseLanguage(language: LanguageCode): language is JapaneseLanguageCode {
  return language === 'ja'
}

export function languageDisplayName(language: LanguageCode): string {
  return LANGUAGES[language].nativeName
}

export function wordPagePath(word: string, language: LanguageCode = 'en'): string {
  const normalizedWord = word.normalize('NFKC').trim().toLowerCase()
  const encodedWord = encodeURIComponent(normalizedWord)
  return language === 'en' ? `/word/${encodedWord}` : `/word/${language}/${encodedWord}`
}

export function japaneseEntryPath(lemma: string, entryId: string): string {
  const normalizedLemma = lemma.normalize('NFKC').trim()
  return `/word/ja/${encodeURIComponent(normalizedLemma)}/${encodeURIComponent(entryId)}`
}

export function lexemeKey(language: LanguageCode, word: string): string {
  return `${language}:${word.normalize('NFKC').trim().toLowerCase()}`
}
