'use client'

import { WordLink } from '@/components/WordLink'
import { ScriptLinks } from '@/components/ScriptLinks'
import { LANGUAGES, type LanguageCode } from '@/lib/languages'
import type { ScriptTarget, WordEntry } from '@/lib/types'

interface LanguageTabsProps {
  word: string
  languages: LanguageCode[]
  failedLanguages?: WordEntry['failedLanguages']
  otherLanguages: string[]
  otherScripts?: ScriptTarget[]
  language?: LanguageCode
  onSelect?: (language: LanguageCode) => void
}

/** Cached entries use crawlable links; an unfinished trace selects its local language slice. */
export function LanguageTabs({
  word,
  languages,
  failedLanguages,
  otherLanguages,
  otherScripts,
  language,
  onSelect,
}: LanguageTabsProps) {
  const tabLanguages = [...new Set([...languages, ...Object.keys(failedLanguages ?? {})])]
    .filter((code): code is LanguageCode => code in LANGUAGES)
    .sort((a, b) => LANGUAGES[a].priority - LANGUAGES[b].priority)
  // A missing requested language still needs a route back to the available entry.
  if (
    tabLanguages.length < 2 &&
    otherLanguages.length === 0 &&
    !otherScripts?.length &&
    (!language || languages.includes(language))
  )
    return null
  const remaining = otherLanguages.length - 8

  return (
    <div className="mt-8">
      <nav
        aria-label={`Languages for ${word}`}
        className="flex flex-wrap gap-x-8 gap-y-3 border-b border-rule"
      >
        {tabLanguages.map((code) => {
          const active = code === language
          const className = `label -mb-px border-b pb-3 transition-colors ${
            active ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
          }`
          return onSelect ? (
            <button
              key={code}
              type="button"
              onClick={() => onSelect(code)}
              aria-current={active ? 'page' : undefined}
              className={className}
            >
              {LANGUAGES[code].englishName}
            </button>
          ) : (
            <WordLink
              key={code}
              word={word}
              language={code === languages[0] ? undefined : code}
              aria-current={active ? 'page' : undefined}
              className={className}
            >
              {LANGUAGES[code].englishName}
            </WordLink>
          )
        })}
      </nav>
      <ScriptLinks targets={otherScripts} />
      {otherLanguages.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          Also a word in {otherLanguages.slice(0, 8).join(', ')}
          {remaining > 0 ? `, and ${remaining} more` : ''} — not covered yet.
        </p>
      )}
    </div>
  )
}
