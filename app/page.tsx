'use client'

import { useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useHistory } from '@/lib/hooks/useHistory'
import { useSimpleMode } from '@/lib/hooks/useSimpleMode'
import { useStreamingEtymology } from '@/lib/hooks/useStreamingEtymology'
import { SearchBar } from '@/components/SearchBar'
import { EtymologyCard } from '@/components/EtymologyCard'
import { RelatedWordsList } from '@/components/RelatedWordsList'
import { SurpriseButton } from '@/components/SurpriseButton'
import { ErrorState } from '@/components/ErrorState'
import ResearchProgress from '@/components/ResearchProgress'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import { ShareMenu } from '@/components/ShareMenu'

const CURATED_IDLE_WORDS = [
  { word: 'algorithm', teaser: "from a Persian mathematician's name" },
  { word: 'salary', teaser: 'ancient Romans were paid in this' },
  { word: 'quarantine', teaser: '40 days of isolation' },
  { word: 'disaster', teaser: "literally 'bad star'" },
  { word: 'nice', teaser: "once meant 'foolish'" },
  { word: 'muscle', teaser: "Latin for 'little mouse'" },
  { word: 'candidate', teaser: 'they wore white' },
  { word: 'villain', teaser: 'just a farmworker' },
  { word: 'window', teaser: "Old Norse for 'wind-eye'" },
  { word: 'panic', teaser: 'named for the god Pan' },
]

// Dynamic imports for code splitting - these components load on-demand
const HistorySidebar = dynamic(
  () => import('@/components/HistorySidebar').then((mod) => ({ default: mod.HistorySidebar })),
  {
    ssr: false,
    loading: () => (
      <div className="fixed left-0 top-0 h-full w-64 bg-cream-dark/50 animate-pulse" />
    ),
  }
)

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const ancestryTreeRef = useRef<HTMLDivElement>(null)

  // Hooks
  const { history, clearHistory, removeFromHistory } = useHistory()
  const { isSimple, toggleSimple } = useSimpleMode()
  const { state, events, partialResult, error, search } = useStreamingEtymology()
  const currentWord = searchParams.get('q')?.toLowerCase() ?? null

  // Handle URL-based search on mount and param changes - intentional URL → action sync
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      search(q)
    }
  }, [searchParams, search])

  // Single callback for all word navigation (history, suggestions, related words, surprise)
  const navigateToWord = useCallback(
    (word: string) => {
      router.push(`/?q=${encodeURIComponent(word)}`, { scroll: false })
    },
    [router]
  )

  const handleHistoryBack = useCallback(() => {
    if (history.length === 0) return

    if (!currentWord) {
      navigateToWord(history[0].word)
      return
    }

    const currentIndex = history.findIndex((entry) => entry.word === currentWord)
    if (currentIndex === -1) {
      navigateToWord(history[0].word)
      return
    }

    const nextIndex = Math.min(currentIndex + 1, history.length - 1)
    navigateToWord(history[nextIndex].word)
  }, [history, currentWord, navigateToWord])

  const handleHistoryForward = useCallback(() => {
    if (!currentWord || history.length === 0) return

    const currentIndex = history.findIndex((entry) => entry.word === currentWord)
    if (currentIndex <= 0) return

    navigateToWord(history[currentIndex - 1].word)
  }, [history, currentWord, navigateToWord])

  return (
    <main
      className="
      min-h-screen
      bg-cream
      py-8 md:py-16
      px-4
    "
    >
      {/* History sidebar */}
      <HistorySidebar
        history={history}
        onWordClick={navigateToWord}
        onClearHistory={clearHistory}
        onRemoveEntry={removeFromHistory}
      />

      {/* Main content */}
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="text-center mb-12 md:mb-16">
          {/* Navigation links */}
          <nav className="flex justify-center gap-6 mb-8 text-sm font-serif">
            <Link href="/faq" className="text-charcoal-light hover:text-charcoal transition-colors">
              FAQ
            </Link>
            <Link
              href="/learn/what-is-etymology"
              className="text-charcoal-light hover:text-charcoal transition-colors"
            >
              Learn
            </Link>
          </nav>

          <h1
            className="
            font-serif text-4xl md:text-5xl
            text-charcoal
            mb-3
            tracking-tight
          "
          >
            Etymology Explorer
          </h1>
          <p
            className="
            font-serif text-lg
            text-charcoal-light
            italic
          "
          >
            Discover the roots and origins of words
          </p>
        </header>

        {/* Search bar */}
        <div className="mb-12">
          <SearchBar
            onSearch={navigateToWord}
            isLoading={state === 'loading'}
            initialValue={searchParams.get('q') || ''}
            inputRef={searchInputRef}
          />

          {/* Surprise button */}
          <div className="flex justify-center mt-6">
            <SurpriseButton onWordSelected={navigateToWord} disabled={state === 'loading'} />
          </div>
        </div>

        {/* Results area */}
        <div className="min-h-[400px]">
          {/* Loading state - show research progress */}
          {state === 'loading' && (
            <div className="py-8">
              <ResearchProgress events={events} isStreaming={true} />
            </div>
          )}

          {/* Idle state */}
          {state === 'idle' && (
            <section
              className="
                relative overflow-hidden
                rounded-lg border border-charcoal/10
                bg-gradient-to-b from-white to-cream-dark/30
                p-6 sm:p-8 md:p-10
              "
            >
              <div className="absolute -top-10 -right-8 h-32 w-32 rounded-full bg-amber-200/25 blur-2xl" />
              <div className="absolute -bottom-12 -left-10 h-36 w-36 rounded-full bg-emerald-200/20 blur-2xl" />

              <header className="relative mb-8">
                <p className="text-xs uppercase tracking-[0.2em] text-charcoal-light/60 mb-3">
                  Try these words
                </p>
                <h2 className="font-serif text-3xl md:text-4xl text-charcoal tracking-tight">
                  Explore word origins
                </h2>
                <p className="font-serif italic text-charcoal-light mt-3 max-w-2xl">
                  Wander through curious entries that reveal how meanings drift, split, and return.
                </p>
              </header>

              <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {CURATED_IDLE_WORDS.map((entry, index) => (
                  <button
                    key={entry.word}
                    onClick={() => navigateToWord(entry.word)}
                    className="
                      group text-left
                      rounded-md border border-charcoal/10
                      bg-white/85 backdrop-blur-[1px]
                      p-4 sm:p-5
                      shadow-[0_1px_0_rgba(0,0,0,0.04)]
                      hover:border-charcoal/25 hover:-translate-y-0.5
                      hover:shadow-[0_10px_24px_rgba(41,37,36,0.08)]
                      transition-all duration-300
                      animate-fadeIn
                    "
                    style={{ animationDelay: `${index * 70}ms`, animationFillMode: 'backwards' }}
                  >
                    <span className="font-serif text-xl text-charcoal group-hover:italic transition-all">
                      {entry.word}
                    </span>
                    <p className="mt-2 text-sm leading-relaxed text-charcoal-light">
                      {entry.teaser}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Error state */}
          {state === 'error' && error && (
            <ErrorState
              type="network-error"
              message={error}
              suggestions={[]}
              onSuggestionClick={navigateToWord}
            />
          )}

          {/* Success state */}
          {state === 'success' && partialResult && (
            <div className="space-y-12">
              {/* Main etymology card */}
              <EtymologyCard
                result={partialResult}
                onWordClick={navigateToWord}
                isSimple={isSimple}
                ancestryTreeRef={ancestryTreeRef}
                headerActions={
                  <ShareMenu
                    word={partialResult.word}
                    result={partialResult}
                    ancestryTreeRef={ancestryTreeRef}
                  />
                }
              />

              {/* Related words section */}
              {partialResult.roots.length > 0 && (
                <section>
                  <h2
                    className="
                    font-serif text-lg
                    text-charcoal
                    mb-6
                    flex items-center gap-4
                  "
                  >
                    <span className="w-8 h-px bg-charcoal/20" />
                    Related Words
                    <span className="flex-1 h-px bg-charcoal/20" />
                  </h2>

                  <RelatedWordsList roots={partialResult.roots} onWordClick={navigateToWord} />
                </section>
              )}
            </div>
          )}
        </div>

        <KeyboardShortcuts
          onFocusSearch={() => searchInputRef.current?.focus()}
          onHistoryBack={handleHistoryBack}
          onHistoryForward={handleHistoryForward}
          onToggleSimpleMode={toggleSimple}
        />

        {/* Footer */}
        <footer
          className="
          mt-24
          pt-8
          border-t border-charcoal/10
          text-center
        "
        >
          <p
            className="
            text-sm font-serif
            text-charcoal-light/50
          "
          >
            Built by{' '}
            <a
              href="https://thepushkarp.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-charcoal"
            >
              thepushkarp
            </a>{' '}
            with Curiosity, Claude, Codex and Cursor
          </p>
          <p
            className="
            text-xs
            text-charcoal-light/30
            mt-2
          "
          >
            Etymology data from Etymonline, Wiktionary, Wikipedia, and Urban Dictionary
          </p>
        </footer>
      </div>
    </main>
  )
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-cream flex items-center justify-center">
          <div className="text-center">
            <div
              className="
            w-12 h-12 mx-auto mb-4
            border-2 border-charcoal/20
            border-t-charcoal
            rounded-full
            animate-spin
          "
            />
            <p className="font-serif text-charcoal-light italic">Loading...</p>
          </div>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  )
}
