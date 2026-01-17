'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { EtymologyResult, WordSuggestion, LLMConfig } from '@/lib/types'
import { useHistory } from '@/lib/hooks/useHistory'
import { useLocalStorage } from '@/lib/hooks/useLocalStorage'
import { SearchBar } from '@/components/SearchBar'
import { EtymologyCard } from '@/components/EtymologyCard'
import { RelatedWordsList } from '@/components/RelatedWordsList'
import { SettingsButton } from '@/components/SettingsModal'
import { SurpriseButton } from '@/components/SurpriseButton'
import { ErrorState, EmptyState } from '@/components/ErrorState'

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

const SettingsModal = dynamic(
  () => import('@/components/SettingsModal').then((mod) => ({ default: mod.SettingsModal })),
  {
    ssr: false,
    loading: () => null, // Modal - no visible loading state needed
  }
)

type AppState = 'idle' | 'loading' | 'success' | 'error'
type ErrorType = 'nonsense' | 'no-api-key' | 'network-error' | 'typo'

// Consolidated error state to reduce render thrashing
interface ErrorInfo {
  type: ErrorType
  message: string
  suggestions: WordSuggestion[]
}

const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'anthropic',
  anthropicApiKey: '',
  anthropicModel: 'claude-haiku-4-5-20251001',
  openrouterApiKey: '',
  openrouterModel: '',
}

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // State
  const [state, setState] = useState<AppState>('idle')
  const [result, setResult] = useState<EtymologyResult | null>(null)
  const [error, setError] = useState<ErrorInfo | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Hooks
  const [llmConfig, setLlmConfig] = useLocalStorage<LLMConfig>(
    'etymology-llm-config',
    DEFAULT_LLM_CONFIG
  )
  const { history, addToHistory, clearHistory, removeFromHistory } = useHistory()

  // Search function
  const searchWord = useCallback(
    async (word: string) => {
      const trimmed = word.trim().toLowerCase()
      if (!trimmed) return

      // Check for valid LLM config
      const isConfigValid =
        llmConfig.provider === 'anthropic'
          ? llmConfig.anthropicApiKey.length > 0
          : llmConfig.openrouterApiKey.length > 0 && llmConfig.openrouterModel.length > 0

      if (!isConfigValid) {
        setState('error')
        setError({
          type: 'no-api-key',
          message:
            llmConfig.provider === 'anthropic'
              ? "You'll need an Anthropic API key to explore etymologies."
              : "You'll need to configure OpenRouter with an API key and model.",
          suggestions: [],
        })
        return
      }

      setState('loading')
      setResult(null)
      setError(null)

      try {
        const response = await fetch('/api/etymology', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word: trimmed, llmConfig }),
        })

        const data = await response.json()

        if (data.success && data.data) {
          setState('success')
          setResult(data.data)
          addToHistory(trimmed)
        } else if (data.suggestions && data.suggestions.length > 0) {
          // Typo detected - show suggestions
          setState('error')
          setError({
            type: 'typo',
            message: `We couldn't find "${trimmed}" in our lexicon.`,
            suggestions: data.suggestions,
          })
        } else {
          // Nonsense word
          setState('error')
          setError({
            type: 'nonsense',
            message: data.error || "That doesn't appear to be a word we recognize.",
            suggestions: [],
          })
        }
      } catch (err) {
        console.error('Search failed:', err)
        setState('error')
        setError({
          type: 'network-error',
          message: 'Something went awry in the ether...',
          suggestions: [],
        })
      }
    },
    [llmConfig, addToHistory]
  )

  // Handle URL-based search on mount and param changes - intentional URL → action sync
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      searchWord(q)
    }
  }, [searchParams, searchWord])

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
      {/* Settings button */}
      <SettingsButton onClick={() => setIsSettingsOpen(true)} />

      {/* History sidebar */}
      <HistorySidebar
        history={history}
        onWordClick={navigateToWord}
        onClearHistory={clearHistory}
        onRemoveEntry={removeFromHistory}
      />

      {/* Settings modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        llmConfig={llmConfig}
        onSaveConfig={setLlmConfig}
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
          {state === 'error' && error && (
            <ErrorState
              type={error.type}
              message={error.message}
              suggestions={error.suggestions}
              onSuggestionClick={navigateToWord}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}

          {/* Success state */}
          {state === 'success' && result && (
            <div className="space-y-12">
              {/* Main etymology card */}
              <EtymologyCard result={result} onWordClick={navigateToWord} />

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

                  <RelatedWordsList roots={result.roots} onWordClick={navigateToWord} />
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
