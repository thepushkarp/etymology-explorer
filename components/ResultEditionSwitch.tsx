'use client'

import { LANGUAGES, type BetaLanguageCode } from '@/lib/languages'
import type { ResultLocale } from '@/lib/resultLocalization'

interface ResultEditionSwitchProps {
  language: BetaLanguageCode
  locale: ResultLocale
  onChange: (locale: ResultLocale) => void
}

export function ResultEditionSwitch({ language, locale, onChange }: ResultEditionSwitchProps) {
  return (
    <div className="inline-flex items-center gap-2" aria-label="Reading edition">
      <span className="hidden text-[9px] uppercase tracking-[0.2em] text-charcoal-light/58 sm:inline">
        edition
      </span>
      <div
        className="inline-flex rounded-full border border-border-soft bg-surface p-1"
        role="group"
        aria-label="Result language"
      >
        <EditionButton active={locale === 'en'} onClick={() => onChange('en')}>
          English
        </EditionButton>
        <EditionButton active={locale === 'local'} onClick={() => onChange('local')}>
          {LANGUAGES[language].nativeName}
        </EditionButton>
      </div>
    </div>
  )
}

function EditionButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1.5 text-[11px] transition-colors sm:px-3 sm:text-xs ${
        active ? 'bg-charcoal text-cream' : 'text-charcoal-light hover:text-charcoal'
      }`}
    >
      {children}
    </button>
  )
}
