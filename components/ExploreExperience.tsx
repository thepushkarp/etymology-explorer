'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
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
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import type { ApiResponse, NgramResult } from '@/lib/types'

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

export function ExploreExperience() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { history, clearHistory, removeFromHistory } = useHistory()
  const { isSimple, toggleSimple } = useSimpleMode()
  const { state, events, partialResult, error, search, reset } = useStreamingEtymology()
  const currentWord = searchParams.get('q')?.toLowerCase() ?? null
  const [ngramData, setNgramData] = useState<NgramResult | null>(null)
  const [suggestionsVisible, setSuggestionsVisible] = useState(false)

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

  const resultWithNgram = partialResult
    ? {
        ...partialResult,
        ngram: ngramData && ngramData.word === partialResult.word ? ngramData : undefined,
      }
    : null

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

  const isIdle = state === 'idle'
  const hasSearchContext = !isIdle
  const heroSubtitle = hasSearchContext
    ? 'The map comes first, then the story, then the wider family of meanings around it.'
    : 'A quiet field guide to the lives of words: their migrations, their ancestors, and the slow turns of meaning.'

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
        <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pt-14">
          <section className="border-b border-border-soft pb-12">
            <div className="w-full">
              <div className="max-w-4xl">
                <h1
                  className={`font-serif tracking-[-0.05em] text-charcoal ${
                    hasSearchContext
                      ? 'text-5xl sm:text-6xl lg:text-7xl'
                      : 'text-6xl sm:text-7xl lg:text-[5.8rem]'
                  }`}
                >
                  {hasSearchContext ? (
                    'Follow the word back.'
                  ) : (
                    <>
                      Trace any <span className="text-accent-soft">word</span> back to its{' '}
                      <span className="text-accent-soft">root</span>.
                    </>
                  )}
                </h1>
                <p className="mt-6 max-w-2xl font-serif text-xl italic leading-relaxed text-charcoal-light sm:text-[1.7rem]">
                  {heroSubtitle}
                </p>
              </div>

              <div className="mt-8 w-full">
                <SearchBar
                  onSearch={navigateToWord}
                  isLoading={state === 'loading'}
                  initialValue={searchParams.get('q') || ''}
                  inputRef={searchInputRef}
                  onSuggestionsVisibilityChange={setSuggestionsVisible}
                />
                {!suggestionsVisible && (
                  <div className="mt-5 flex justify-center">
                    <SurpriseButton
                      onWordSelected={navigateToWord}
                      disabled={state === 'loading'}
                    />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="pt-10">
            {state === 'loading' && (
              <ResearchProgress
                events={events}
                query={searchParams.get('q') || partialResult?.word || ''}
              />
            )}

            {state === 'idle' && (
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
            )}

            {state === 'error' && error && (
              <ErrorState
                type={error.type}
                message={error.message}
                suggestions={error.suggestions}
                onSuggestionClick={navigateToWord}
              />
            )}

            {state === 'success' && resultWithNgram && (
              <div className="space-y-10">
                <EtymologyCard
                  result={resultWithNgram}
                  onWordClick={navigateToWord}
                  isSimple={isSimple}
                  headerActions={<ShareMenu result={resultWithNgram} />}
                />

                {resultWithNgram.roots.length > 0 && (
                  <section className="editorial-panel p-6 sm:p-8">
                    <div className="mb-6 border-b border-border-soft pb-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
                        kin & kindred
                      </p>
                      <h2 className="mt-3 font-serif text-3xl tracking-[-0.04em] text-charcoal">
                        Other words from the same roots
                      </h2>
                      <p className="mt-3 max-w-2xl font-serif italic leading-relaxed text-charcoal-light">
                        A small family album of cognates, descendants, and neighboring meanings.
                      </p>
                    </div>
                    <RelatedWordsList roots={resultWithNgram.roots} onWordClick={navigateToWord} />
                  </section>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      <KeyboardShortcuts
        onFocusSearch={() => searchInputRef.current?.focus()}
        onHistoryBack={handleHistoryBack}
        onHistoryForward={handleHistoryForward}
        onToggleSimpleMode={toggleSimple}
      />

      <SiteFooter />
    </div>
  )
}
