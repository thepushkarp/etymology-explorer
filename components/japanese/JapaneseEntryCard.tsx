'use client'

import { useCallback, useState } from 'react'
import '@fontsource/shippori-mincho/japanese-500.css'
import type { LearnerEtymologyResult, SourceReference } from '@/lib/types'

const STRATUM_LABELS = {
  native: '和語 · Native Japanese',
  'sino-japanese': '漢語 · Sino-Japanese',
  loanword: '外来語 · Loanword',
  hybrid: '混種語 · Hybrid',
  wasei: '和製語 · Japanese coinage',
  uncertain: '語源区分不詳 · Uncertain stratum',
} as const

const SOURCE_LABELS: Partial<Record<SourceReference['name'], string>> = {
  jmdict: 'JMdict · EDRDG',
  wiktionaryEnglish: 'English Wiktionary',
  wiktionaryNative: 'Japanese Wiktionary',
  wold: 'World Loanword Database',
  wikidataLexeme: 'Wikidata Lexeme',
}

export function JapaneseEntryCard({
  result,
  searchedQuery,
  matchExplanation,
  onPlayPronunciation,
  headerActions,
}: {
  result: LearnerEtymologyResult
  searchedQuery?: string
  matchExplanation?: string
  onPlayPronunciation?: () => void
  headerActions?: React.ReactNode
}) {
  const [showRomaji, setShowRomaji] = useState(false)
  const toggleRomaji = useCallback(() => setShowRomaji((visible) => !visible), [])
  const showLookupContext = searchedQuery && searchedQuery !== result.word
  const showInflectionMap = showLookupContext && matchExplanation?.includes('form')

  return (
    <article className="editorial-shell animate-fadeIn p-4 sm:p-7 lg:p-9">
      <header className="border-b border-border-soft pb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-charcoal-light/66">
              Japanese entry · β
            </p>
            {showLookupContext ? (
              <p className="mt-2 text-xs text-charcoal-light">
                You searched <span className="font-japanese text-charcoal">{searchedQuery}</span>
                {matchExplanation ? ` · ${matchExplanation}` : ''}
              </p>
            ) : null}
          </div>
          {headerActions}
        </div>

        <div className="mt-7">
          <h1 className="font-japanese text-[clamp(3.6rem,16vw,7.4rem)] leading-[0.9] tracking-[-0.035em] text-charcoal">
            <ruby>
              {result.word}
              <rp>(</rp>
              <rt className="font-japanese text-[0.23em] tracking-[0.12em] text-reading-indigo">
                {result.reading}
              </rt>
              <rp>)</rp>
            </ruby>
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleRomaji}
              className="editorial-chip text-xs"
              aria-pressed={showRomaji}
            >
              {showRomaji ? 'Hide romaji' : 'Show romaji'}
            </button>
            {showRomaji ? (
              <span className="text-sm italic text-charcoal-light">{result.romaji}</span>
            ) : null}
            {onPlayPronunciation ? (
              <button
                type="button"
                onClick={onPlayPronunciation}
                className="editorial-chip text-xs"
              >
                Listen <span aria-hidden="true">↗</span>
              </button>
            ) : null}
          </div>
        </div>

        <p className="mt-6 max-w-3xl font-serif text-[1.55rem] italic leading-relaxed text-charcoal">
          {result.definition}
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-charcoal-light">
          <span className="rounded-full border border-border-soft px-3 py-1.5">
            {STRATUM_LABELS[result.lexicalStratum]}
          </span>
          {result.partsOfSpeech?.map((part) => (
            <span key={part.pos} className="rounded-full border border-border-soft px-3 py-1.5">
              {part.pos}
            </span>
          ))}
          {result.evidenceState === 'lexical_only' ? (
            <span className="rounded-full border border-uncertain-gold/40 px-3 py-1.5 text-uncertain-gold">
              lexical evidence only
            </span>
          ) : (
            <span className="rounded-full border border-origin-persimmon/35 px-3 py-1.5 text-origin-persimmon">
              source-backed · medium confidence
            </span>
          )}
        </div>
      </header>

      <section className="mt-8">
        <p className="section-kicker">How this form works</p>
        {showInflectionMap ? (
          <div className="mt-4 overflow-x-auto pb-3">
            <div className="flex min-w-max items-center gap-3">
              <div className="min-w-36 border-y border-border-soft bg-cream-dark/35 px-4 py-4 text-center">
                <p className="font-japanese text-2xl text-charcoal">{searchedQuery}</p>
                <p className="mt-2 font-serif text-sm italic text-charcoal-light">
                  {matchExplanation}
                </p>
              </div>
              <span aria-hidden="true" className="text-origin-persimmon">
                →
              </span>
              <div className="min-w-36 border-y border-origin-persimmon/30 bg-origin-persimmon/5 px-4 py-4 text-center">
                <p className="font-japanese text-2xl text-charcoal">{result.word}</p>
                <p className="mt-1 font-japanese text-xs text-reading-indigo">{result.reading}</p>
                <p className="mt-2 font-serif text-sm italic text-charcoal-light">
                  dictionary form
                </p>
              </div>
            </div>
          </div>
        ) : null}
        <div className="mt-4 overflow-x-auto pb-3">
          <div className="flex min-w-max items-stretch gap-2">
            {result.formation.parts.map((part, index) => (
              <div key={`${part.form}:${index}`} className="flex items-center gap-2">
                <div className="min-w-36 border-y border-border-soft bg-cream-dark/35 px-4 py-4 text-center">
                  <p className="font-japanese text-2xl text-charcoal">{part.form}</p>
                  {part.reading ? (
                    <p className="mt-1 font-japanese text-xs text-reading-indigo">{part.reading}</p>
                  ) : null}
                  <p className="mt-2 max-w-44 font-serif text-sm italic text-charcoal-light">
                    {part.meaning}
                  </p>
                </div>
                {index < result.formation.parts.length - 1 ? (
                  <span aria-hidden="true" className="text-origin-persimmon">
                    {result.formation.kind === 'borrowing' ||
                    result.formation.kind === 'historical-development'
                      ? '→'
                      : '+'}
                  </span>
                ) : null}
              </div>
            ))}
            {result.formation.parts.length > 1 ? (
              <>
                <span aria-hidden="true" className="self-center text-origin-persimmon">
                  →
                </span>
                <div className="min-w-36 border-y border-origin-persimmon/30 bg-origin-persimmon/5 px-4 py-4 text-center">
                  <p className="font-japanese text-2xl text-charcoal">{result.formation.result}</p>
                  <p className="mt-2 font-serif text-sm italic text-charcoal-light">
                    the whole form
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </div>
        <p className="mt-3 max-w-3xl font-serif leading-relaxed text-charcoal-light">
          {result.formation.note}
        </p>
      </section>

      <section className="mt-10 border-t border-border-soft pt-8">
        <p className="section-kicker">Where it came from</p>
        <p className="mt-4 max-w-3xl font-serif text-xl leading-relaxed text-charcoal">
          {result.originSummary}
        </p>
        {result.ancestryGraph.branches.length > 0 ? (
          <div className="mt-6 space-y-5">
            {result.ancestryGraph.branches.map((branch) => (
              <ol key={branch.root} className="border-l border-origin-persimmon/35 pl-5">
                {branch.stages.map((stage) => (
                  <li key={`${stage.stage}:${stage.form}`} className="relative pb-5 last:pb-0">
                    <span className="absolute -left-[1.4rem] top-2 h-2 w-2 rounded-full bg-origin-persimmon" />
                    <p className="text-[10px] uppercase tracking-[0.18em] text-charcoal-light">
                      {stage.stage}
                    </p>
                    <p className="mt-1 font-japanese text-xl text-charcoal">{stage.form}</p>
                    <p className="mt-1 font-serif text-sm italic text-charcoal-light">
                      {stage.note}
                    </p>
                  </li>
                ))}
              </ol>
            ))}
          </div>
        ) : null}
      </section>

      <section className="mt-10 border-t border-border-soft pt-8">
        <p className="section-kicker">The story</p>
        <p className="mt-4 max-w-3xl font-serif text-[1.08rem] leading-[1.85] text-charcoal">
          {result.lore}
        </p>
      </section>

      {result.alternateForms.length > 0 ? (
        <section className="mt-10 border-t border-border-soft pt-8">
          <p className="section-kicker">Other forms and readings</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {result.alternateForms.slice(0, 12).map((form) => (
              <span key={form} className="editorial-chip font-japanese">
                {form}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-10 border-t border-border-soft pt-8">
        <p className="section-kicker">Sources</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {result.sources.map((source) => (
            <div
              key={`${source.name}:${source.url}`}
              className="rounded-xl border border-border-soft px-4 py-3 transition-colors hover:border-border-strong"
            >
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-charcoal underline-offset-4 hover:underline"
              >
                {SOURCE_LABELS[source.name] ?? source.name}
              </a>
              {source.license ? (
                source.licenseUrl ? (
                  <a
                    href={source.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-[10px] uppercase tracking-[0.14em] text-charcoal-light underline underline-offset-2"
                  >
                    {source.license} · license
                  </a>
                ) : (
                  <span className="mt-1 block text-[10px] uppercase tracking-[0.14em] text-charcoal-light">
                    {source.license}
                  </span>
                )
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 border-t border-border-soft pt-8">
        <p className="section-kicker">Further scholarly references</p>
        <p className="mt-3 font-serif text-sm italic text-charcoal-light">
          Reference links only; restricted dictionaries and subscription corpora were not read by
          the synthesis.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            className="editorial-chip"
            href="https://clrd.ninjal.ac.jp/chj/"
            target="_blank"
            rel="noreferrer"
          >
            NINJAL CHJ
          </a>
          <a
            className="editorial-chip"
            href="https://japanknowledge.com/"
            target="_blank"
            rel="noreferrer"
          >
            JapanKnowledge
          </a>
          <a
            className="editorial-chip"
            href="https://lab.ndl.go.jp/dataset/ngramviewer/"
            target="_blank"
            rel="noreferrer"
          >
            NDL Ngram Viewer
          </a>
        </div>
      </section>
    </article>
  )
}
