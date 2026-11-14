'use client'

import { useEffect, useState } from 'react'
import { SearchBox } from '@/components/SearchBox'
import { LanguageSelect } from '@/components/LanguageSelect'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { WordLink } from '@/components/WordLink'
import { useWordNavigation } from '@/lib/hooks/useWordNavigation'
import { useSearchLanguage } from '@/lib/hooks/useSearchLanguage'
import {
  landingSearchPreviews,
  parseRecentSearchPreviews,
  type RecentSearchPreview,
} from '@/lib/recentSearchPreview'
import { LANGUAGES, SUPPORTED_LANGUAGE_CODES, type LanguageCode } from '@/lib/languages'

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
  const recentWords = recent.filter((entry) => !language || entry.language === language).slice(0, 4)
  const curated = language
    ? CURATED_WORDS[language].map((entry) => ({ ...entry, language }))
    : SUPPORTED_LANGUAGE_CODES.map((code) => ({ ...CURATED_WORDS[code][0], language: code }))
  const words = landingSearchPreviews(recentWords, curated)

  useEffect(() => {
    const controller = new AbortController()
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
          setRecent(parseRecentSearchPreviews(payload.data))
        }
      } catch (error) {
        if (!controller.signal.aborted) console.warn('[RecentSearches] Preview unavailable:', error)
      }
    }
    void loadRecentSearches()
    return () => controller.abort()
  }, [language])

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
            <LanguageSelect value={language} onChange={setLanguage} />
            <p className="text-sm text-muted">
              Or <RandomWordButton language={language} />.
            </p>
          </div>
        </div>

        <section className="mt-24" aria-labelledby="curated-heading">
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
                style={{ animationDelay: `${160 + index * 60}ms` }}
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
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

function RandomWordButton({ language }: { language?: LanguageCode }) {
  const navigateToWord = useWordNavigation()
  const [loading, setLoading] = useState(false)

  const pick = async () => {
    if (loading) return
    setLoading(true)
    try {
      const query = language ? `?language=${language}` : ''
      const response = await fetch(`/api/random-word${query}`, { cache: 'no-store' })
      const payload = await response.json()
      if (payload.success && payload.data?.word) navigateToWord(payload.data.word, language)
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
      disabled={loading}
      className="link italic disabled:opacity-60"
    >
      {loading ? 'finding one…' : 'open a random word'}
    </button>
  )
}
