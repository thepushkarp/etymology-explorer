'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SearchBox } from '@/components/SearchBox'
import { LanguageSelect } from '@/components/LanguageSelect'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { WordLink } from '@/components/WordLink'
import { entryPagePath } from '@/lib/entrySelection'
import { useWordNavigation } from '@/lib/hooks/useWordNavigation'
import { useSearchLanguage } from '@/lib/hooks/useSearchLanguage'
import {
  landingSearchPreviews,
  parseRecentSearchPreviews,
  type RecentSearchPreview,
} from '@/lib/recentSearchPreview'
import { LANGUAGES, SUPPORTED_LANGUAGE_CODES, type LanguageCode } from '@/lib/languages'

const RECENT_CACHE_TTL_MS = 60_000
const recentSearchCache = new Map<string, { data: RecentSearchPreview[]; expiresAt: number }>()

function getCachedRecentSearches(key: string): RecentSearchPreview[] | null {
  const cached = recentSearchCache.get(key)
  if (!cached) return null
  if (Date.now() > cached.expiresAt) {
    recentSearchCache.delete(key)
    return null
  }
  return cached.data
}

const CURATED_WORDS: Record<LanguageCode, Array<{ word: string; teaser: string }>> = {
  en: [
    { word: 'nice', teaser: "once meant 'foolish'" },
    { word: 'villain', teaser: 'used to mean farmworker' },
    { word: 'muscle', teaser: "Latin for 'little mouse'" },
    { word: 'window', teaser: "Old Norse for 'wind-eye'" },
  ],
  it: [
    { word: 'casa', teaser: "Latin for 'hut'" },
    { word: 'ciao', teaser: "began as 'your servant'" },
    { word: 'finestra', teaser: 'inherited from Latin fenestra' },
    { word: 'lavoro', teaser: "from Latin labor, 'toil'" },
  ],
  es: [
    { word: 'ojalá', teaser: 'from an Arabic expression' },
    { word: 'izquierda', teaser: 'borrowed from Basque' },
    { word: 'ventana', teaser: "built from the word for 'wind'" },
    { word: 'alcalde', teaser: "from Arabic for 'judge'" },
  ],
  fr: [
    { word: 'fenêtre', teaser: 'inherited from Latin fenestra' },
    { word: 'fromage', teaser: "from Latin for something 'formed'" },
    { word: 'travail', teaser: 'linked to Latin tripalium' },
    { word: "aujourd'hui", teaser: "still carries an old word for 'today'" },
  ],
  pt: [
    { word: 'janela', teaser: "Latin for 'little door'" },
    { word: 'obrigado', teaser: "literally 'obliged'" },
    { word: 'esquerda', teaser: 'a Basque loan shared across Iberia' },
    { word: 'saudade', teaser: 'an origin etymologists still debate' },
  ],
  hi: [
    { word: 'पानी', teaser: 'inherited through generations of Indo-Aryan speech' },
    { word: 'किताब', teaser: 'an Arabic word carried through Persian' },
    { word: 'जंगल', teaser: "the source of English 'jungle'" },
    { word: 'नमस्ते', teaser: 'a greeting borrowed from Sanskrit' },
  ],
  ur: [
    { word: 'پانی', teaser: 'an inherited word for water' },
    { word: 'کتاب', teaser: 'an Arabic word carried through Persian' },
    { word: 'دل', teaser: "Persian for 'heart'" },
    { word: 'زبان', teaser: "a Persian word for 'tongue' and 'language'" },
  ],
  sa: [
    { word: 'अग्नि', teaser: 'an ancient word for fire' },
    { word: 'धर्म', teaser: "built on a root meaning 'hold'" },
    { word: 'योग', teaser: "the source of English 'yoga'" },
    { word: 'विद्या', teaser: 'knowledge with an ancient lineage' },
  ],
  ja: [
    { word: '電話', teaser: 'a Japanese coinage built from Chinese elements' },
    { word: '山', teaser: 'an inherited Japanese word written with a Chinese character' },
    { word: 'パン', teaser: 'a Portuguese word for bread' },
    { word: 'コンセント', teaser: 'a shortened Japanese coinage for an electrical outlet' },
  ],
}

export function Landing() {
  const [language, setLanguage] = useSearchLanguage()
  const [recent, setRecent] = useState<RecentSearchPreview[]>([])
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const requestKey = language ?? 'auto'
  const loading = loadedKey !== requestKey
  const recentWords = recent.filter((entry) => !language || entry.language === language).slice(0, 4)
  const curated = language
    ? CURATED_WORDS[language].map((entry) => ({ ...entry, language }))
    : SUPPORTED_LANGUAGE_CODES.map((code) => ({ ...CURATED_WORDS[code][0], language: code }))
  const words = landingSearchPreviews(recentWords, curated)

  const handleLanguageChange = (next?: LanguageCode) => {
    setLanguage(next)
    const nextKey = next ?? 'auto'
    const cached = getCachedRecentSearches(nextKey)
    if (cached !== null) {
      setRecent(cached)
      setLoadedKey(nextKey)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const cached = getCachedRecentSearches(requestKey)
    if (cached !== null) {
      void Promise.resolve(cached).then((data) => {
        if (!controller.signal.aborted) {
          setRecent(data)
          setLoadedKey(requestKey)
        }
      })
      return () => controller.abort()
    }
    async function loadRecentSearches() {
      try {
        const query = language ? `?language=${language}` : ''
        const response = await fetch(`/api/recent-searches${query}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = await response.json()
        if (!payload.success) throw new Error('Recent searches unavailable')
        if (!controller.signal.aborted) {
          const parsed = parseRecentSearchPreviews(payload.data)
          recentSearchCache.set(requestKey, {
            data: parsed,
            expiresAt: Date.now() + RECENT_CACHE_TTL_MS,
          })
          setRecent(parsed)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setRecent([])
          console.warn('[RecentSearches] Preview unavailable:', error)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadedKey(requestKey)
        }
      }
    }
    void loadRecentSearches()
    return () => controller.abort()
  }, [language, requestKey])

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pt-20 sm:px-6 sm:pt-28">
        <h1 className="animate-rise font-serif text-[clamp(2.4rem,8vw,3.75rem)] leading-[1.05] tracking-tight text-ink">
          Every word has
          <br />
          <em className="text-accent">a past.</em>
        </h1>

        <div className="animate-rise relative z-20 mt-12 [animation-delay:80ms]">
          <SearchBox language={language} size="large" autoFocus />
          <div className="mt-2 flex flex-wrap items-center gap-x-6">
            <LanguageSelect value={language} onChange={handleLanguageChange} />
            <p className="flex min-h-11 items-center gap-1.5 text-sm leading-5 text-muted">
              <span>Or</span>
              <RandomWordButton language={language} />
            </p>
          </div>
        </div>

        <section className="mt-24" aria-labelledby={loading ? undefined : 'curated-heading'}>
          {loading ? (
            <>
              <div aria-hidden="true" className="shimmer h-3.5 w-32 rounded-sm" />
              <ul
                aria-busy="true"
                aria-label="Loading words to explore"
                className="mt-4 border-t border-rule"
              >
                {Array.from({ length: 4 }, (_, index) => (
                  <li key={index} className="flex flex-col gap-2.5 border-b border-rule py-4">
                    <div className="shimmer h-6 w-28 rounded-sm" />
                    <div className="shimmer h-4 w-3/4 max-w-md rounded-sm" />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h2 id="curated-heading" className="label">
                {recentWords.length === 4
                  ? 'Recently explored'
                  : recentWords.length > 0
                    ? 'Explore a word'
                    : 'Start here'}
              </h2>
              <ul className="mt-4 border-t border-rule">
                {words.map((entry, index) => (
                  <li
                    key={entry.word}
                    className="animate-rise"
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
                    <WordLink
                      word={entry.word}
                      language={language}
                      className="group flex flex-col items-start gap-1 border-b border-rule py-4"
                    >
                      <span className="font-serif text-xl text-ink transition-colors group-hover:text-accent">
                        <span lang={entry.language} dir="auto">
                          {entry.word}
                        </span>
                        {!language && (
                          <span className="label ml-3 text-muted">
                            {LANGUAGES[entry.language].englishName}
                          </span>
                        )}
                      </span>
                      <span className="text-left font-serif text-sm italic text-muted transition-colors group-hover:text-ink">
                        {entry.teaser}
                      </span>
                    </WordLink>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

// Standard Western six-sided die: opposite faces sum to 7 (1↔6, 2↔5, 3↔4)
// and 1 → 2 → 3 runs counterclockwise around their shared corner.
// Hovering tilts the cube to reveal 1 (top), 3 (front), and 5 (right).
export const DIE_FACES: Array<{ transform: string; pips: Array<[number, number]> }> = [
  {
    // Front: 3 (opposite Back: 4)
    transform: 'translateZ(8px)',
    pips: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
  },
  {
    // Back: 4 (opposite Front: 3)
    transform: 'rotateY(180deg) translateZ(8px)',
    pips: [
      [0, 0],
      [0, 2],
      [2, 0],
      [2, 2],
    ],
  },
  {
    // Right: 5 (opposite Left: 2)
    transform: 'rotateY(90deg) translateZ(8px)',
    pips: [
      [0, 0],
      [0, 2],
      [1, 1],
      [2, 0],
      [2, 2],
    ],
  },
  {
    // Left: 2 (opposite Right: 5)
    transform: 'rotateY(-90deg) translateZ(8px)',
    pips: [
      [0, 0],
      [2, 2],
    ],
  },
  {
    // Top: 1 (opposite Bottom: 6)
    transform: 'rotateX(90deg) translateZ(8px)',
    pips: [[1, 1]],
  },
  {
    // Bottom: 6 (opposite Top: 1)
    transform: 'rotateX(-90deg) translateZ(8px)',
    pips: [
      [0, 0],
      [0, 2],
      [1, 0],
      [1, 2],
      [2, 0],
      [2, 2],
    ],
  },
]

function Dice3D() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center [perspective:120px]"
    >
      <span className="relative h-4 w-4 [transform-style:preserve-3d] transition-[transform,color] duration-500 ease-[cubic-bezier(0.34,1.45,0.64,1)] group-hover:text-accent group-hover:[transform:rotateX(-32deg)_rotateY(-40deg)_rotateZ(8deg)] group-focus-visible:text-accent group-focus-visible:[transform:rotateX(-32deg)_rotateY(-40deg)_rotateZ(8deg)]">
        {DIE_FACES.map((face, index) => (
          <span
            key={index}
            style={{ transform: face.transform }}
            className="absolute inset-0 grid grid-cols-3 grid-rows-3 place-items-center rounded-[2px] border border-current bg-paper p-[2px] [backface-visibility:hidden]"
          >
            {face.pips.map(([row, col], pipIndex) => (
              <span
                key={pipIndex}
                style={{ gridRow: row + 1, gridColumn: col + 1 }}
                className="h-[2px] w-[2px] rounded-full bg-current"
              />
            ))}
          </span>
        ))}
      </span>
    </span>
  )
}

const RANDOM_WARM_TTL_MS = 30_000

function RandomWordButton({ language }: { language?: LanguageCode }) {
  const router = useRouter()
  const navigateToWord = useWordNavigation()
  const [loading, setLoading] = useState(false)
  const prefetchedRef = useRef<{
    language?: LanguageCode
    expiresAt: number
    promise: Promise<string | null>
  } | null>(null)

  const fetchCandidate = (targetLanguage?: LanguageCode): Promise<string | null> => {
    const query = targetLanguage ? `?language=${targetLanguage}` : ''
    return fetch(`/api/random-word${query}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => (payload.success && payload.data?.word ? String(payload.data.word) : null))
      .catch(() => null)
  }

  const warm = () => {
    if (loading) return
    const existing = prefetchedRef.current
    if (existing && existing.language === language && existing.expiresAt > Date.now()) return
    const entry = {
      language,
      expiresAt: Date.now() + RANDOM_WARM_TTL_MS,
      promise: fetchCandidate(language).then((word) => {
        if (word) {
          router.prefetch(entryPagePath(word, language))
        } else if (prefetchedRef.current === entry) {
          prefetchedRef.current = null
        }
        return word
      }),
    }
    prefetchedRef.current = entry
  }

  const pick = async () => {
    if (loading) return
    setLoading(true)
    try {
      const existing = prefetchedRef.current
      const warmed =
        existing && existing.language === language && existing.expiresAt > Date.now()
          ? existing.promise
          : null
      prefetchedRef.current = null
      const word = (warmed ? await warmed : null) ?? (await fetchCandidate(language))
      if (word) navigateToWord(word, language)
    } catch {
      // Offline or rate limited: the button simply does nothing.
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={pick}
      onMouseEnter={warm}
      onFocus={warm}
      disabled={loading}
      className="group inline-flex cursor-pointer items-center gap-1.5 leading-5 disabled:cursor-wait disabled:opacity-60"
    >
      <Dice3D />
      <span className="link italic group-hover:text-accent">
        {loading ? 'finding one…' : 'open a random word'}
      </span>
    </button>
  )
}
