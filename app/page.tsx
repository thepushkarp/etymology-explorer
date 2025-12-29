'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { EtymologyResult, WordSuggestion } from '@/lib/types'
import { useHistory } from '@/lib/hooks/useHistory'
import { useLocalStorage } from '@/lib/hooks/useLocalStorage'
import { SearchBar } from '@/components/SearchBar'
import { EtymologyCard } from '@/components/EtymologyCard'
import { RelatedWordsList } from '@/components/RelatedWordsList'
import { HistorySidebar } from '@/components/HistorySidebar'
import { SettingsModal, SettingsButton } from '@/components/SettingsModal'
import { SurpriseButton } from '@/components/SurpriseButton'
import { ErrorState, EmptyState } from '@/components/ErrorState'

type AppState = 'idle' | 'loading' | 'success' | 'error'
type ErrorType = 'nonsense' | 'no-api-key' | 'network-error' | 'typo'

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // State
  const [state, setState] = useState<AppState>('idle')
  const [result, setResult] = useState<EtymologyResult | null>(null)
  const [errorType, setErrorType] = useState<ErrorType>('nonsense')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [suggestions, setSuggestions] = useState<WordSuggestion[]>([])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Hooks
  const [apiKey, setApiKey] = useLocalStorage<string>('etymology-api-key', '')
  const { history, addToHistory, clearHistory, removeFromHistory } = useHistory()

  // Search function
  const searchWord = useCallback(
    async (word: string) => {
      const trimmed = word.trim().toLowerCase()
      if (!trimmed) return

      // Check API key
      if (!apiKey) {
        setState('error')
        setErrorType('no-api-key')
        setErrorMessage("You'll need an Anthropic API key to explore etymologies.")
        return
      }

      setState('loading')
      setResult(null)
      setSuggestions([])

      try {
        const response = await fetch('/api/etymology', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word: trimmed, apiKey }),
        })

        const data = await response.json()

        if (data.success && data.data) {
          setState('success')
          setResult(data.data)
          addToHistory(trimmed)
        } else if (data.suggestions && data.suggestions.length > 0) {
          // Typo detected - show suggestions
          setState('error')
          setErrorType('typo')
          setErrorMessage(`We couldn't find "${trimmed}" in our lexicon.`)
          setSuggestions(data.suggestions)
        } else {
          // Nonsense word
          setState('error')
          setErrorType('nonsense')
          setErrorMessage(data.error || "That doesn't appear to be a word we recognize.")
        }
      } catch (error) {
        console.error('Search failed:', error)
        setState('error')
        setErrorType('network-error')
        setErrorMessage('Something went awry in the ether...')
      }
    },
    [apiKey, addToHistory]
  )

  // Handle URL-based search on mount and param changes - intentional URL → action sync
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      searchWord(q)
    }
  }, [searchParams, searchWord])

  // Handle word click (from related words, history, etc.)
  const handleWordClick = useCallback(
    (word: string) => {
      router.push(`/?q=${encodeURIComponent(word)}`, { scroll: false })
    },
    [router]
  )

  // Handle surprise word
  const handleSurpriseWord = useCallback(
    (word: string) => {
      router.push(`/?q=${encodeURIComponent(word)}`, { scroll: false })
    },
    [router]
  )

  // Handle suggestion click
  const handleSuggestionClick = useCallback(
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
      {/* Settings button */}
      <SettingsButton onClick={() => setIsSettingsOpen(true)} />

      {/* History sidebar */}
      <HistorySidebar
        history={history}
        onWordClick={handleWordClick}
        onClearHistory={clearHistory}
        onRemoveEntry={removeFromHistory}
      />

      {/* Settings modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={apiKey}
        onSaveApiKey={setApiKey}
      />

      {/* Main content */}
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="text-center mb-12 md:mb-16">
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
            onSearch={(word) => router.push(`/?q=${encodeURIComponent(word)}`, { scroll: false })}
            isLoading={state === 'loading'}
            initialValue={searchParams.get('q') || ''}
          />

          {/* Surprise button */}
          <div className="flex justify-center mt-6">
            <SurpriseButton onWordSelected={handleSurpriseWord} disabled={state === 'loading'} />
          </div>
        </div>

        {/* Results area */}
        <div className="min-h-[400px]">
          {/* Loading state */}
          {state === 'loading' && (
            <div className="flex justify-center py-16">
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
                <p className="font-serif text-charcoal-light italic">
                  Tracing etymological roots...
                </p>
              </div>
            </div>
          )}

          {/* Idle state */}
          {state === 'idle' && <EmptyState />}

          {/* Error state */}
          {state === 'error' && (
            <ErrorState
              type={errorType}
              message={errorMessage}
              suggestions={suggestions}
              onSuggestionClick={handleSuggestionClick}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}

          {/* Success state */}
          {state === 'success' && result && (
            <div className="space-y-12">
              {/* Main etymology card */}
              <EtymologyCard result={result} onWordClick={handleWordClick} />

              {/* Related words section */}
              {result.roots.length > 0 && (
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

                  <RelatedWordsList roots={result.roots} onWordClick={handleWordClick} />
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
            Built with curiosity and Claude
          </p>
          <p
            className="
            text-xs
            text-charcoal-light/30
            mt-2
          "
          >
            Etymology data from Etymonline & Wiktionary
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
