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

interface CuratedWordSet {
  heading: string
  description: string
  words: Array<{ word: string; teaser: string }>
}

const CURATED_WORDS: Record<LanguageCode, CuratedWordSet> = {
  en: {
    heading: 'Start with a word that already has a story.',
    description: 'Begin with a familiar word, then follow its older forms and borrowed meanings.',
    words: [
      { word: 'nice', teaser: "once meant 'foolish'" },
      { word: 'villain', teaser: 'used to mean farmworker' },
      { word: 'muscle', teaser: "Latin for 'little mouse'" },
      { word: 'window', teaser: "Old Norse for 'wind-eye'" },
    ],
  },
  it: {
    heading: 'Start with an Italian word.',
    description: 'Choose a familiar word and trace the forms it inherited or borrowed.',
    words: [
      { word: 'casa', teaser: "Latin for 'hut'" },
      { word: 'ciao', teaser: "began as 'your servant'" },
      { word: 'finestra', teaser: 'inherited from Latin fenestra' },
      { word: 'lavoro', teaser: "from Latin labor, 'toil'" },
    ],
  },
  es: {
    heading: 'Start with a Spanish word.',
    description: 'Follow words shaped by Latin, Arabic, Basque, and everyday speech.',
    words: [
      { word: 'ojalá', teaser: 'from an Arabic expression' },
      { word: 'izquierda', teaser: 'borrowed from Basque' },
      { word: 'ventana', teaser: "built from the word for 'wind'" },
      { word: 'alcalde', teaser: "from Arabic for 'judge'" },
    ],
  },
  fr: {
    heading: 'Start with a French word.',
    description: 'Trace familiar French forms back through Latin and older French.',
    words: [
      { word: 'fenêtre', teaser: 'inherited from Latin fenestra' },
      { word: 'fromage', teaser: "from Latin for something 'formed'" },
      { word: 'travail', teaser: 'linked to Latin tripalium' },
      { word: "aujourd'hui", teaser: "still carries an old word for 'today'" },
    ],
  },
  pt: {
    heading: 'Start with a Portuguese word.',
    description: 'Explore words shaped by Latin and the wider history of Iberia.',
    words: [
      { word: 'janela', teaser: "Latin for 'little door'" },
      { word: 'obrigado', teaser: "literally 'obliged'" },
      { word: 'esquerda', teaser: 'a Basque loan shared across Iberia' },
      { word: 'saudade', teaser: 'an origin etymologists still debate' },
    ],
  },
}

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
  const curatedWords = CURATED_WORDS[language]

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
          <section className="pb-9 sm:pb-11">
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
                <div className="mb-2 flex justify-end px-1">
                  <select
                    id="search-language"
                    aria-label="Search language"
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

          <section
            className="border-t border-border-soft pt-8 sm:pt-9"
            aria-label={`${LANGUAGES[language].englishName} sample words`}
          >
            <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
              try these words
            </p>
            <h2 className="mt-3 max-w-3xl font-serif text-[2rem] leading-tight tracking-[-0.045em] text-charcoal sm:text-4xl">
              {curatedWords.heading}
            </h2>
            <p className="mt-3 max-w-2xl font-serif italic leading-relaxed text-charcoal-light">
              {curatedWords.description}
            </p>
            <div className="mt-7 grid border-t border-border-soft sm:grid-cols-2">
              {curatedWords.words.map((entry, index) => (
                <button
                  key={`${language}:${entry.word}`}
                  onClick={() => navigateToWord(entry.word, language)}
                  className="animate-fadeIn border-b border-border-soft px-1 py-5 text-left transition-colors duration-200 hover:bg-surface/55 sm:px-4 sm:[&:nth-child(odd)]:border-r"
                  style={{
                    animationDelay: `${index * 70}ms`,
                    animationFillMode: 'backwards',
                  }}
                >
                  <span className="block font-serif text-2xl text-charcoal">{entry.word}</span>
                  <span className="mt-2 block font-serif text-base italic leading-relaxed text-charcoal-light">
                    {entry.teaser}
                  </span>
                </button>
              ))}
            </div>
          </section>
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
