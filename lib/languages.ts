import { canonicalizeWord } from './orthography'
export const SUPPORTED_LANGUAGE_CODES = ['en', 'it', 'es', 'fr', 'pt'] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number]

export interface LanguageDefinition {
  code: LanguageCode
  englishName: string
  nativeName: string
  wiktionaryEdition: string
  englishWiktionaryHeading: string
  nativeWiktionaryHeading: string
  etymologyHeading: RegExp
  formHeading: RegExp
  ngramCorpus: string | null
  /** Language-specific synthesis rules appended to the system prompt. */
  promptNotes?: string
}

export const LANGUAGES: Record<LanguageCode, LanguageDefinition> = {
  en: {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
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
    wiktionaryEdition: 'pt',
    englishWiktionaryHeading: 'Portuguese',
    nativeWiktionaryHeading: 'Português',
    etymologyHeading: /^Etimologia(?:\s+\d+)?$/i,
    formHeading: /^(?:Forma verbal|Forma nominal|Particípio|Conjugação)/i,
    ngramCorpus: null,
    promptNotes:
      'PORTUGUESE: write the example sentences in neutral Portuguese. When a Brazilian/European distinction matters, label it explicitly; never silently choose one regional variant.',
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

export function wordPagePath(word: string, language: LanguageCode = 'en'): string {
  const normalizedWord = canonicalizeWord(word)
  const encodedWord = encodeURIComponent(normalizedWord)
  return language === 'en' ? `/word/${encodedWord}` : `/word/${language}/${encodedWord}`
}

export function lexemeKey(language: LanguageCode, word: string): string {
  return `${language}:${canonicalizeWord(word)}`
}
