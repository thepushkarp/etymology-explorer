'use client'

import { memo } from 'react'
import { EtymologyResult, SourceReference } from '@/lib/types'
import { RootChip } from './RootChip'
import { AncestryTree } from './AncestryTree'
import { PronunciationButton } from './PronunciationButton'

interface EtymologyCardProps {
  result: EtymologyResult
  onWordClick: (word: string) => void
}

export const EtymologyCard = memo(function EtymologyCard({
  result,
  onWordClick,
}: EtymologyCardProps) {
  return (
    <article
      className="
        relative
        bg-white
        rounded-lg
        shadow-sm
        border border-charcoal/5
        overflow-hidden
        animate-fadeIn
      "
    >
      {/* Paper texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Main content */}
      <div className="relative p-8 md:p-12">
        {/* Header: Word + Pronunciation */}
        <header className="mb-8 pb-6 border-b border-charcoal/10">
          <div className="flex items-baseline gap-4 flex-wrap">
            {/* Main word - styled like a dictionary headword */}
            <h1
              className="
              font-serif text-4xl md:text-5xl
              font-bold text-charcoal
              tracking-tight
            "
            >
              {result.word}
            </h1>

            {/* Pronunciation in IPA with audio button */}
            <span
              className="
              inline-flex items-center gap-1
              font-serif text-lg
              text-charcoal-light italic
            "
            >
              {result.pronunciation}
              <PronunciationButton word={result.word} />
            </span>
          </div>

          {/* Definition */}
          <p
            className="
            mt-4 font-serif text-lg
            text-charcoal/80
            leading-relaxed
          "
          >
            {result.definition}
          </p>

          {/* POS Tags - after definition */}
          {result.partsOfSpeech && result.partsOfSpeech.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {result.partsOfSpeech.map(({ pos, definition, pronunciation }, idx) => (
                <div
                  key={`${pos}-${idx}`}
                  className="group inline-flex items-center gap-2 px-3 py-1.5 bg-cream-dark/50 border border-charcoal/10 rounded-full"
                  title={definition}
                >
                  <span className="text-xs font-serif uppercase tracking-wider text-charcoal/60">
                    {pos}
                  </span>
                  {pronunciation && pronunciation !== result.pronunciation && (
                    <span className="text-xs font-serif italic text-charcoal/50">
                      {pronunciation}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </header>

        {/* Roots section */}
        <section className="mb-8">
          <h2
            className="
            font-serif text-sm uppercase
            text-charcoal-light tracking-widest
            mb-4
          "
          >
            Etymological Roots
          </h2>

          <div className="flex flex-wrap gap-3">
            {result.roots.map((root, index) => (
              <RootChip key={`${root.root}-${index}`} root={root} onWordClick={onWordClick} />
            ))}
          </div>
        </section>

        {/* Ancestry graph - visual journey showing root branches merging */}
        {result.ancestryGraph && result.ancestryGraph.branches?.length > 0 && (
          <AncestryTree graph={result.ancestryGraph} word={result.word} />
        )}

        {/* Lore section - the memorable narrative */}
        <section className="mb-8">
          <h2
            className="
            font-serif text-sm uppercase
            text-charcoal-light tracking-widest
            mb-4
          "
          >
            The Story
          </h2>

          <div
            className="
            relative
            pl-6
            border-l-2 border-charcoal/20
          "
          >
            {/* Decorative quotation mark */}
            <span
              className="
              absolute -left-3 -top-2
              text-4xl font-serif
              text-charcoal/10
              select-none
            "
            >
              &ldquo;
            </span>

            <p
              className="
              font-serif text-lg
              text-charcoal/90
              leading-relaxed italic
            "
            >
              {result.lore}
            </p>
          </div>
        </section>

        {/* Modern Usage - after lore, before related words */}
        {result.modernUsage && result.modernUsage.hasSlangMeaning && (
          <section className="mb-8">
            <h2 className="font-serif text-sm uppercase text-charcoal-light tracking-widest mb-4">
              Modern Usage
            </h2>
            <div className="relative pl-6 border-l-2 border-violet-200">
              {result.modernUsage.slangDefinition && (
                <p className="font-serif text-lg text-charcoal/80 leading-relaxed mb-3">
                  {result.modernUsage.slangDefinition}
                </p>
              )}
              {result.modernUsage.popularizedBy && (
                <p className="text-sm text-charcoal/60 mb-2">
                  <span className="font-medium">Popularized by:</span>{' '}
                  {result.modernUsage.popularizedBy}
                </p>
              )}
              {result.modernUsage.contexts && result.modernUsage.contexts.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {result.modernUsage.contexts.map((ctx) => (
                    <span
                      key={ctx}
                      className="px-2 py-0.5 text-xs font-serif bg-violet-50 text-violet-700 border border-violet-200 rounded-full"
                    >
                      {ctx}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Related Words / Suggestions - after modern usage section */}
        {result.suggestions && (
          <section className="mb-8">
            <h2 className="font-serif text-sm uppercase text-charcoal-light tracking-widest mb-4">
              Related Words
            </h2>
            <div className="space-y-4">
              {result.suggestions.synonyms && result.suggestions.synonyms.length > 0 && (
                <SuggestionRow
                  label="Synonyms"
                  words={result.suggestions.synonyms}
                  onWordClick={onWordClick}
                  color="emerald"
                />
              )}
              {result.suggestions.antonyms && result.suggestions.antonyms.length > 0 && (
                <SuggestionRow
                  label="Antonyms"
                  words={result.suggestions.antonyms}
                  onWordClick={onWordClick}
                  color="rose"
                />
              )}
              {result.suggestions.homophones && result.suggestions.homophones.length > 0 && (
                <SuggestionRow
                  label="Homophones"
                  words={result.suggestions.homophones}
                  onWordClick={onWordClick}
                  color="amber"
                />
              )}
              {result.suggestions.easilyConfusedWith &&
                result.suggestions.easilyConfusedWith.length > 0 && (
                  <SuggestionRow
                    label="Often Confused With"
                    words={result.suggestions.easilyConfusedWith}
                    onWordClick={onWordClick}
                    color="blue"
                  />
                )}
              {result.suggestions.seeAlso && result.suggestions.seeAlso.length > 0 && (
                <SuggestionRow
                  label="See Also"
                  words={result.suggestions.seeAlso}
                  onWordClick={onWordClick}
                  color="purple"
                />
              )}
            </div>
          </section>
        )}

        {/* Sources footer */}
        <footer
          className="
          pt-6
          border-t border-charcoal/10
          flex flex-col sm:flex-row sm:items-center sm:justify-between
          gap-4
        "
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span
              className="
              font-serif text-xs uppercase
              text-charcoal-light/60 tracking-wider
              shrink-0
            "
            >
              Sources
            </span>
            <div className="flex flex-wrap gap-2">
              {result.sources.map((source, index) => (
                <SourceBadge key={`${source.name}-${source.word || index}`} source={source} />
              ))}
            </div>
          </div>

          {/* Decorative flourish - hidden on mobile */}
          <div
            className="
            hidden sm:flex items-center gap-2
            text-charcoal/20
          "
          >
            <span className="w-8 h-px bg-current" />
            <span className="text-xs font-serif italic">§</span>
            <span className="w-8 h-px bg-current" />
          </div>
        </footer>
      </div>
    </article>
  )
})

function SourceBadge({ source }: { source: SourceReference }) {
  const labels: Record<string, string> = {
    etymonline: 'Etymonline',
    wiktionary: 'Wiktionary',
    synthesized: 'AI Synthesis',
  }

  const colors: Record<string, string> = {
    etymonline:
      'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-300',
    wiktionary: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300',
    synthesized: 'bg-purple-50 text-purple-700 border-purple-200',
  }

  const baseClasses = `
    px-2 py-0.5
    text-xs font-serif
    rounded
    border
    transition-colors duration-200
    ${colors[source.name] || 'bg-gray-50 text-gray-700 border-gray-200'}
  `

  const sourceLabel = labels[source.name] || source.name

  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClasses} inline-flex items-center gap-1`}
      >
        {sourceLabel}
        {source.word && (
          <>
            <span className="opacity-50">:</span>
            <span className="italic opacity-80">{source.word}</span>
          </>
        )}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </a>
    )
  }

  return <span className={baseClasses}>{sourceLabel}</span>
}

function SuggestionRow({
  label,
  words,
  onWordClick,
  color,
}: {
  label: string
  words: string[]
  onWordClick: (word: string) => void
  color: 'emerald' | 'rose' | 'amber' | 'blue' | 'purple'
}) {
  const colorClasses = {
    emerald: 'border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300',
    rose: 'border-rose-200 hover:bg-rose-50 hover:border-rose-300',
    amber: 'border-amber-200 hover:bg-amber-50 hover:border-amber-300',
    blue: 'border-blue-200 hover:bg-blue-50 hover:border-blue-300',
    purple: 'border-purple-200 hover:bg-purple-50 hover:border-purple-300',
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-serif uppercase tracking-wider text-charcoal/40 w-32 shrink-0">
        {label}
      </span>
      {words.map((word) => (
        <button
          key={word}
          onClick={() => onWordClick(word)}
          className={`
            px-2.5 py-1 text-sm font-serif text-charcoal/80
            border rounded-md transition-colors cursor-pointer
            ${colorClasses[color]}
          `}
        >
          {word}
        </button>
      ))}
    </div>
  )
}
