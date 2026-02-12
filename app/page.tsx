'use client'

import { useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useHistory } from '@/lib/hooks/useHistory'
import { useStreamingEtymology } from '@/lib/hooks/useStreamingEtymology'
import { SearchBar } from '@/components/SearchBar'
import { EtymologyCard } from '@/components/EtymologyCard'
import { RelatedWordsList } from '@/components/RelatedWordsList'
import { SurpriseButton } from '@/components/SurpriseButton'
import { ErrorState, EmptyState } from '@/components/ErrorState'
import ResearchProgress from '@/components/ResearchProgress'

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

  // Hooks
  const { history, clearHistory, removeFromHistory } = useHistory()
  const { state, events, partialResult, error, search } = useStreamingEtymology()

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
          {state === 'idle' && <EmptyState />}

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
              <EtymologyCard result={partialResult} onWordClick={navigateToWord} />

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
