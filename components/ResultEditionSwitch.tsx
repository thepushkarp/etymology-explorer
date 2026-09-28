'use client'

import { LANGUAGES, type BetaLanguageCode } from '@/lib/languages'
import type { ResultLocale } from '@/lib/resultLocalization'

interface ResultEditionSwitchProps {
  language: BetaLanguageCode
  locale: ResultLocale
  onChange: (locale: ResultLocale) => void
}

/** Read a beta entry in English or in the word's own language. */
export function ResultEditionSwitch({ language, locale, onChange }: ResultEditionSwitchProps) {
  const options: Array<[ResultLocale, string]> = [
    ['en', 'English'],
    ['local', LANGUAGES[language].nativeName],
  ]
  return (
    <div className="flex gap-3 text-sm" role="group" aria-label="Reading edition">
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={locale === value}
          className={`transition-colors ${
            locale === value ? 'text-ink underline underline-offset-4' : 'text-muted hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
