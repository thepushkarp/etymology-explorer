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
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { history, clearHistory, removeFromHistory } = useHistory()
  const { navigateToWord, historyBack, historyForward } = useWordNavigation(null)
  const [suggestionsVisible, setSuggestionsVisible] = useState(false)

  return (
    <div className="min-h-screen bg-cream text-charcoal">
      <SiteHeader />

      <HistorySidebar
        history={history}
        onWordClick={navigateToWord}
        onClearHistory={clearHistory}
        onRemoveEntry={removeFromHistory}
      />

      <main className="relative overflow-hidden">
        <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-8 sm:px-6 sm:pt-10 lg:px-8 lg:pt-14">
          <section className="border-b border-border-soft pb-10 sm:pb-12">
            <div className="w-full">
              <div className="max-w-4xl">
                <h1 className="font-serif leading-[0.98] tracking-[-0.04em] text-charcoal text-[clamp(3.35rem,14.8vw,5.8rem)] sm:tracking-[-0.05em]">
                  Trace any <span className="text-accent-soft">word</span> back to its{' '}
                  <span className="text-accent-soft">root</span>.
                </h1>
                <p className="mt-6 max-w-2xl font-serif text-lg italic leading-relaxed text-charcoal-light sm:text-[1.35rem]">
                  Trace words through older forms, borrowed meanings, and hidden roots.
                </p>
              </div>

              <div className="mt-8 w-full">
                <SearchBar
                  onSearch={navigateToWord}
                  inputRef={searchInputRef}
                  onSuggestionsVisibilityChange={setSuggestionsVisible}
                />
                {!suggestionsVisible && (
                  <div className="mt-5 flex justify-center">
                    <SurpriseButton onWordSelected={navigateToWord} />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="pt-10">
            <div>
              <section className="editorial-panel p-8 sm:p-10">
                <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
                  try these words
                </p>
                <h2 className="mt-3 font-serif text-3xl tracking-[-0.04em] text-charcoal sm:text-4xl">
                  Start with a word that already has a story.
                </h2>
                <p className="mt-3 max-w-2xl font-serif italic leading-relaxed text-charcoal-light">
                  Begin with a familiar word, then follow its older forms and borrowed meanings.
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {CURATED_IDLE_WORDS.map((entry, index) => (
                    <button
                      key={entry.word}
                      onClick={() => navigateToWord(entry.word)}
                      className="animate-fadeIn rounded-[1rem] border border-border-soft bg-[color:var(--surface-muted)]/28 px-4 py-5 text-left transition-all duration-200 hover:-translate-y-px hover:border-border-strong hover:bg-surface"
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
