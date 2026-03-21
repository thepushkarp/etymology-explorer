'use client'

import { useEffect, useCallback, useRef, Suspense, useState } from 'react'
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
import CostModeIndicator from '@/components/CostModeIndicator'
import ResearchProgress from '@/components/ResearchProgress'
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts'
import { ShareMenu } from '@/components/ShareMenu'
import ThemeToggle from '@/components/ThemeToggle'
import type { ApiResponse, NgramResult } from '@/lib/types'

const CURATED_IDLE_WORDS = [
  { word: 'nice', teaser: "once meant 'foolish'" },
  { word: 'villain', teaser: 'used to mean farmworker' },
  { word: 'muscle', teaser: "Latin for 'little mouse'" },
  { word: 'window', teaser: "Old Norse for 'wind-eye'" },
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
  const { state, events, partialResult, error, search, reset } = useStreamingEtymology()
  const currentWord = searchParams.get('q')?.toLowerCase() ?? null
  const [ngramData, setNgramData] = useState<NgramResult | null>(null)

  // Handle URL-based search on mount and param changes - intentional URL → action sync
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      search(q)
    } else {
      reset()
    }
  }, [searchParams, search, reset])

  useEffect(() => {
    const word = partialResult?.word?.trim()
    if (!word) return

    const controller = new AbortController()

    fetch(`/api/ngram?word=${encodeURIComponent(word)}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) return null
        return response.json() as Promise<ApiResponse<NgramResult>>
      })
      .then((payload) => {
        if (payload?.success && payload.data) {
          setNgramData(payload.data)
        }
      })
      .catch((fetchError) => {
        if ((fetchError as Error).name !== 'AbortError') {
          console.error('Failed to fetch ngram data:', fetchError)
        }
      })

    return () => controller.abort()
  }, [partialResult?.word])

  // Only pair ngram data with the result when the word matches; avoids stale data after reset
  const resultWithNgram = partialResult
    ? {
        ...partialResult,
        ngram: ngramData && ngramData.word === partialResult.word ? ngramData : undefined,
      }
    : null

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
      relative min-h-screen overflow-hidden bg-cream px-4 pb-12 pt-6 sm:px-6 lg:px-8
    "
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-gradient-to-b from-surface/80 via-transparent to-transparent" />
      <div className="pointer-events-none absolute left-[-12rem] top-24 h-80 w-80 rounded-full bg-accent-sky/8 blur-3xl" />
      <div className="pointer-events-none absolute right-[-10rem] top-32 h-72 w-72 rounded-full bg-accent-olive/10 blur-3xl" />

      {/* History sidebar */}
      <HistorySidebar
        history={history}
        onWordClick={navigateToWord}
        onClearHistory={clearHistory}
        onRemoveEntry={removeFromHistory}
      />

      {/* Main content */}
      <div className="relative mx-auto max-w-6xl">
        {/* Header */}
        <header className="animate-hero-lift mb-12 md:mb-16">
          <div className="mb-10 flex flex-col gap-5 md:mb-14 md:flex-row md:items-center md:justify-between">
            <nav className="order-2 flex justify-center gap-6 text-[11px] uppercase tracking-[0.22em] text-charcoal-light/72 md:order-1 md:justify-start">
              <Link href="/faq" className="transition-colors hover:text-charcoal">
                FAQ
              </Link>
              <Link
                href="/learn/what-is-etymology"
                className="transition-colors hover:text-charcoal"
              >
                Learn
              </Link>
            </nav>

            <div className="order-1 flex items-center justify-center gap-3 md:order-2 md:justify-end">
              <ThemeToggle />
              <CostModeIndicator />
            </div>
          </div>

          <div className="mx-auto max-w-4xl text-center">
            <h1 className="mb-4 font-serif text-5xl tracking-[-0.04em] text-charcoal sm:text-6xl md:text-7xl">
              <Link href="/" className="transition-opacity hover:opacity-85">
                Etymology Explorer
              </Link>
            </h1>
            <p className="font-serif text-lg italic text-charcoal-light sm:text-xl">
              Discover the roots and origins of words
            </p>
          </div>
        </header>

        {/* Search bar */}
        <section className="animate-hero-lift mb-12 md:mb-16" style={{ animationDelay: '80ms' }}>
          <SearchBar
            onSearch={navigateToWord}
            isLoading={state === 'loading'}
            initialValue={searchParams.get('q') || ''}
            inputRef={searchInputRef}
          />

          <div className="mt-5 flex justify-center">
            <SurpriseButton onWordSelected={navigateToWord} disabled={state === 'loading'} />
          </div>
        </section>

        {/* Results area */}
        <div className="min-h-[400px]">
          {/* Loading state - show research progress */}
          {state === 'loading' && (
            <div className="py-8">
              <ResearchProgress events={events} />
            </div>
          )}

          {/* Idle state */}
          {state === 'idle' && (
            <section
              className="
                relative overflow-hidden rounded-[2rem] border border-border-soft bg-surface/88
                p-6 shadow-[0_24px_60px_-34px_var(--shadow-color)] sm:p-8 md:p-10
              "
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border-strong to-transparent" />
              <div className="absolute -top-12 right-10 h-36 w-36 rounded-full bg-accent-soft/12 blur-3xl" />
              <div className="absolute -bottom-12 left-0 h-40 w-40 rounded-full bg-accent-olive/10 blur-3xl" />

              <header className="relative mb-8">
                <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
                  Try these words
                </p>
                <h2 className="font-serif text-3xl tracking-[-0.03em] text-charcoal md:text-4xl">
                  Explore word origins
                </h2>
                <p className="mt-3 max-w-2xl font-serif italic text-charcoal-light">
                  Wander through curious entries that reveal how meanings drift, split, and return.
                </p>
              </header>

              <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {CURATED_IDLE_WORDS.map((entry, index) => (
                  <button
                    key={entry.word}
                    onClick={() => navigateToWord(entry.word)}
                    className="
                      group animate-fadeIn rounded-[1.4rem] border border-border-soft bg-surface px-4 py-5
                      text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5
                      hover:border-border-strong hover:shadow-[0_18px_44px_-28px_var(--shadow-color)] sm:p-5
                    "
                    style={{ animationDelay: `${index * 70}ms`, animationFillMode: 'backwards' }}
                  >
                    <span className="font-serif text-xl text-charcoal transition-all group-hover:italic">
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
          {state === 'success' && resultWithNgram && (
            <div className="space-y-12">
              {/* Main etymology card */}
              <EtymologyCard
                result={resultWithNgram}
                onWordClick={navigateToWord}
                isSimple={isSimple}
                ancestryTreeRef={ancestryTreeRef}
                headerActions={
                  <ShareMenu
                    word={resultWithNgram.word}
                    result={resultWithNgram}
                    ancestryTreeRef={ancestryTreeRef}
                  />
                }
              />

              {/* Related words section */}
              {resultWithNgram.roots.length > 0 && (
                <section className="rounded-[2rem] border border-border-soft bg-surface/78 p-6 shadow-[0_22px_50px_-34px_var(--shadow-color)] sm:p-8">
                  <h2 className="mb-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-charcoal-light/72">
                    Related Words
                  </h2>

                  <RelatedWordsList roots={resultWithNgram.roots} onWordClick={navigateToWord} />
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
          mt-24 border-t border-border-soft pt-8 text-center
        "
        >
          <p className="text-sm font-serif text-charcoal-light/65">
            Built by{' '}
            <a
              href="https://thepushkarp.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors hover:text-charcoal"
            >
              thepushkarp
            </a>{' '}
            with Curiosity
          </p>
          <p className="mt-2 text-xs text-charcoal-light/50">
            Etymology data from Etymonline, Wiktionary, Wikipedia, Urban Dictionary and Free
            Dictionary
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
