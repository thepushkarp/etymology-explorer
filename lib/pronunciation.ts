import { canonicalizeWord } from './orthography'
import type { LanguageCode } from './languages'

export const PRONUNCIATION_REVISION = 4

/** A single IPA transcription, without dictionary delimiters or explanatory labels. */
export function normalizePronunciation(value: string): string | undefined {
  const trimmed = value.trim().normalize('NFC')
  const body = /^(?:\/([^/]+)\/|\[([^\[\]]+)\])$/.exec(trimmed)
  const ipa = (body?.[1] ?? body?.[2] ?? trimmed).trim()
  return ipa.length > 0 && ipa.length <= 160 && /^[\p{L}\p{M} .ˈˌːˑ‿͜͡|‖↗↘]+$/u.test(ipa)
    ? ipa
    : undefined
}

export function pronunciationReadings(value: string): string[] {
  const delimited = [...value.matchAll(/\/([^/]+)\/|\[([^\[\]]+)\]/g)]
  const readings = (delimited.length ? delimited.map((match) => match[1] ?? match[2]) : [value])
    .map(normalizePronunciation)
    .filter((ipa): ipa is string => Boolean(ipa))
  return [...new Set(readings)]
}

/** Language and spelling remain part of speech identity even when IPA is shared. */
export function pronunciationKey(word: string, language: LanguageCode, ipa?: string): string {
  return `audio:v${PRONUNCIATION_REVISION}:${language}:${encodeURIComponent(canonicalizeWord(word))}:${encodeURIComponent(ipa ?? 'word')}`
}
