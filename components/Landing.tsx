'use client'

import { useState } from 'react'
import { SearchBox } from '@/components/SearchBox'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { WordLink } from '@/components/WordLink'
import { useWordNavigation } from '@/lib/hooks/useWordNavigation'
import {
  BETA_SYMBOL,
  LANGUAGES,
  SUPPORTED_LANGUAGE_CODES,
  type LanguageCode,
} from '@/lib/languages'

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
}

export function Landing() {
  const [language, setLanguage] = useState<LanguageCode>('en')
  const words = CURATED_WORDS[language]

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pt-20 sm:px-6 sm:pt-28">
        <h1 className="animate-rise font-serif text-[clamp(2.4rem,8vw,3.75rem)] leading-[1.05] tracking-tight text-ink">
          Every word has
          <br />
          <em className="text-accent">a past.</em>
        </h1>

        <div className="animate-rise mt-12 [animation-delay:80ms]">
          <div className="flex items-end gap-4">
            <SearchBox key={language} language={language} size="large" autoFocus />
            <select
              aria-label="Word language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as LanguageCode)}
              className="mb-3 shrink-0 cursor-pointer bg-transparent text-right text-sm text-muted outline-none transition-colors hover:text-ink"
            >
              {SUPPORTED_LANGUAGE_CODES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGES[code].nativeName}
                  {LANGUAGES[code].beta ? ` ${BETA_SYMBOL}` : ''}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-4 text-sm text-muted">
            Or <RandomWordButton language={language} />.
          </p>
        </div>

        <section className="mt-24" aria-labelledby="curated-heading">
          <h2 id="curated-heading" className="label">
            Start here
          </h2>
          <ul className="mt-4 border-t border-rule">
            {words.map((entry, index) => (
              <li
                key={`${language}:${entry.word}`}
                className="animate-rise"
                style={{ animationDelay: `${160 + index * 60}ms` }}
              >
                <WordLink
                  word={entry.word}
                  language={language}
                  className="group flex items-baseline justify-between gap-6 border-b border-rule py-4"
                >
                  <span className="font-serif text-xl text-ink transition-colors group-hover:text-accent">
                    {entry.word}
                  </span>
                  <span className="text-right font-serif text-sm italic text-muted transition-colors group-hover:text-ink">
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

function RandomWordButton({ language }: { language: LanguageCode }) {
  const navigateToWord = useWordNavigation()
  const [loading, setLoading] = useState(false)

  const pick = async () => {
    if (loading) return
    setLoading(true)
    try {
      const response = await fetch(`/api/random-word?language=${language}`, { cache: 'no-store' })
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
