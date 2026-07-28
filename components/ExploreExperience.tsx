'use client'

import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useHistory } from '@/lib/hooks/useHistory'
import { useWordNavigation } from '@/lib/hooks/useWordNavigation'
import { SearchBar } from '@/components/SearchBar'
import { SurpriseButton } from '@/components/SurpriseButton'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import {
  BETA_SYMBOL,
  LANGUAGES,
  SUPPORTED_LANGUAGE_CODES,
  type LanguageCode,
} from '@/lib/languages'

const CURATED_IDLE_WORDS = [
  { word: 'nice', teaser: "once meant 'foolish'" },
  { word: 'villain', teaser: 'used to mean farmworker' },
  { word: 'muscle', teaser: "Latin for 'little mouse'" },
  { word: 'window', teaser: "Old Norse for 'wind-eye'" },
]

const HistorySidebar = dynamic(
  () => import('@/components/HistorySidebar').then((mod) => ({ default: mod.HistorySidebar })),
  {
    ssr: false,
    loading: () => <div className="fixed left-0 top-0 h-full w-72 bg-surface/70 animate-pulse" />,
  }
)

/**
 * Landing/search page. Every search — submissions, history clicks,
 * suggestions, curated picks, random words — navigates to the canonical
 * /word/{word} page, which hosts the live tracing experience.
 */
export function ExploreExperience() {
  const [language, setLanguage] = useState<LanguageCode>('en')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { history, clearHistory, removeFromHistory } = useHistory()
  const { navigateToWord, historyBack, historyForward } = useWordNavigation(null, language)
  const [suggestionsVisible, setSuggestionsVisible] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-cream text-charcoal">
      <SiteHeader />

      <HistorySidebar
        history={history}
        onWordClick={(word, entryLanguage) => navigateToWord(word, entryLanguage)}
        onClearHistory={clearHistory}
        onRemoveEntry={removeFromHistory}
      />

      <main className="relative flex-1 overflow-hidden">
        <div className="mx-auto max-w-[1100px] px-4 pb-12 pt-8 sm:px-6 sm:pt-10 lg:px-8 lg:pt-12">
          <section className="border-b border-border-soft pb-9 sm:pb-11">
            <div className="w-full">
              <div className="max-w-4xl">
                <h1 className="font-serif text-[clamp(3.05rem,14vw,5.55rem)] leading-[0.98] tracking-[-0.045em] text-charcoal sm:tracking-[-0.055em]">
                  Trace any <span className="text-accent-soft">word</span> back to its{' '}
                  <span className="text-accent-soft">root</span>.
                </h1>
                <p className="mt-5 max-w-2xl font-serif text-lg italic leading-relaxed text-charcoal-light sm:text-[1.3rem]">
                  Trace words through older forms, borrowed meanings, and hidden roots.
                </p>
              </div>

              <div className="mt-8 w-full max-w-5xl">
                <div className="mb-2 flex items-center justify-between gap-4 border-b border-border-soft px-1 pb-2">
                  <label
                    htmlFor="search-language"
                    className="text-[10px] uppercase tracking-[0.22em] text-charcoal-light/72"
                  >
                    Dictionary edition
                  </label>
                  <select
                    id="search-language"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value as LanguageCode)}
                    className="min-w-0 border-0 bg-transparent py-1 pl-3 pr-1 text-right font-serif text-sm text-charcoal outline-none sm:text-base"
                  >
                    {SUPPORTED_LANGUAGE_CODES.map((code) => (
                      <option key={code} value={code}>
                        {LANGUAGES[code].nativeName}
                        {LANGUAGES[code].beta ? ` · ${BETA_SYMBOL}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <SearchBar
                  onSearch={(word) => navigateToWord(word, language)}
                  language={language}
                  inputRef={searchInputRef}
                  onSuggestionsVisibilityChange={setSuggestionsVisible}
                />
                {!suggestionsVisible && language === 'en' && (
                  <div className="mt-4 flex justify-center">
                    <SurpriseButton onWordSelected={navigateToWord} />
                  </div>
                )}
              </div>
            </div>
          </section>

          {language === 'en' && (
            <section className="pt-9">
              <div className="border-y border-border-soft py-7 sm:py-9">
                <section>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
                    try these words
                  </p>
                  <h2 className="mt-3 max-w-3xl font-serif text-[2rem] leading-tight tracking-[-0.045em] text-charcoal sm:text-4xl">
                    Start with a word that already has a story.
                  </h2>
                  <p className="mt-3 max-w-2xl font-serif italic leading-relaxed text-charcoal-light">
                    Begin with a familiar word, then follow its older forms and borrowed meanings.
                  </p>
                  <div className="mt-7 grid border-t border-border-soft sm:grid-cols-2">
                    {CURATED_IDLE_WORDS.map((entry, index) => (
                      <button
                        key={entry.word}
                        onClick={() => navigateToWord(entry.word)}
                        className="animate-fadeIn border-b border-border-soft px-1 py-5 text-left transition-colors duration-200 hover:bg-surface/55 sm:px-4 sm:[&:nth-child(odd)]:border-r"
                        style={{
                          animationDelay: `${index * 70}ms`,
                          animationFillMode: 'backwards',
                        }}
                      >
                        <span className="block font-serif text-2xl text-charcoal">
                          {entry.word}
                        </span>
                        <span className="mt-2 block font-serif text-base italic leading-relaxed text-charcoal-light">
                          {entry.teaser}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </section>
          )}

          {language !== 'en' && (
            <section className="pt-9" aria-label={`${LANGUAGES[language].nativeName} beta edition`}>
              <div className="border-y border-border-soft py-7 sm:py-9">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-charcoal-light/62">
                      research edition
                    </p>
                    <h2 className="mt-2 font-serif text-3xl tracking-[-0.04em] text-charcoal sm:text-4xl">
                      {LANGUAGES[language].nativeName}{' '}
                      <span className="normal-case text-accent-amber">{BETA_SYMBOL}</span>
                    </h2>
                  </div>
                  <p className="max-w-xl font-serif italic leading-relaxed text-charcoal-light">
                    Search this language explicitly. Every entry keeps one evidence trail with
                    paired English and {LANGUAGES[language].nativeName} commentary.
                  </p>
                </div>
                <dl className="mt-7 grid gap-5 border-t border-border-soft pt-6 sm:grid-cols-3">
                  <EditionDetail
                    term="No guessing"
                    detail="The selected edition defines the lexeme."
                  />
                  <EditionDetail
                    term="Paired reading"
                    detail="Switch the whole entry between both languages."
                  />
                  <EditionDetail
                    term="Native evidence"
                    detail="Language-specific Wiktionary and lexeme sources."
                  />
                </dl>
              </div>
            </section>
          )}
        </div>
      </main>

      <KeyboardShortcuts
        onFocusSearch={() => searchInputRef.current?.focus()}
        onHistoryBack={historyBack}
        onHistoryForward={historyForward}
      />

      <SiteFooter />
    </div>
  )
}

function EditionDetail({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.2em] text-charcoal-light/62">{term}</dt>
      <dd className="mt-2 font-serif text-base leading-relaxed text-charcoal/82">{detail}</dd>
    </div>
  )
}
