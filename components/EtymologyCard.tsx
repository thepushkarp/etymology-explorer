'use client'

import { memo } from 'react'
import { EtymologyResult, SourceReference } from '@/lib/types'
import { RootChip } from './RootChip'
import { AncestryTree } from './AncestryTree'
import { PronunciationButton } from './PronunciationButton'
import HistoricalContext from './HistoricalContext'
import UsageTimeline from './UsageTimeline'

interface EtymologyCardProps {
  result: EtymologyResult
  onWordClick: (word: string) => void
  isSimple?: boolean
  headerActions?: React.ReactNode
  ancestryTreeRef?: React.RefObject<HTMLDivElement | null>
}

export const EtymologyCard = memo(function EtymologyCard({
  result,
  onWordClick,
  isSimple = false,
  headerActions,
  ancestryTreeRef,
}: EtymologyCardProps) {
  return (
    <article
      className="
        relative
        bg-surface
        dark:bg-surface
        rounded-lg
        shadow-sm
        border border-border-soft
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
      <div className="relative p-5 sm:p-8 md:p-12">
        {/* Header: Word + Pronunciation */}
        <header className="mb-8 pb-6 border-b border-border-soft">
          <div className="flex items-start justify-between gap-3 flex-wrap">
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
                  text-charcoal-light dark:text-charcoal-light italic
              "
              >
                {!isSimple && result.pronunciation}
                <PronunciationButton word={result.word} />
              </span>
            </div>

            {headerActions && <div className="pt-1 shrink-0">{headerActions}</div>}
          </div>

          {/* First Attested Date */}
          {result.rawSources?.dateAttested && (
            <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 bg-cream-dark/45 border border-border-soft rounded-full text-xs font-serif text-charcoal/70 dark:text-charcoal-light">
              <span className="text-charcoal/40">⏱</span>
              First attested {result.rawSources.dateAttested}
            </span>
          )}

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

          {result.ngram && result.ngram.data.length > 0 && (
            <div className="mt-4 border-t border-border-soft pt-3">
              <h4 className="mb-2 font-serif text-xs uppercase tracking-wider text-charcoal/55">
                Usage over time
              </h4>
              <UsageTimeline data={result.ngram.data} word={result.ngram.word} showYearLabels />
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
        {result.ancestryGraph?.branches?.length > 0 && (
          <div ref={ancestryTreeRef}>
            <AncestryTree graph={result.ancestryGraph} word={result.word} isSimple={isSimple} />
          </div>
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
              text-charcoal/20
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

        {/* Historical Context - Wikipedia extract */}
        {!isSimple && result.rawSources?.wikipedia && (
          <HistoricalContext wikipediaExtract={result.rawSources.wikipedia} />
        )}

        {/* Modern Usage - after lore, before related words */}
        {result.modernUsage && result.modernUsage.hasSlangMeaning && (
          <section className="mb-8">
            <h2 className="font-serif text-sm uppercase text-charcoal-light tracking-widest mb-4">
              Modern Usage
            </h2>
            <div className="relative pl-6 border-l-2 border-violet-200 dark:border-violet-800">
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
                      className="px-2 py-0.5 text-xs font-serif bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700 rounded-full"
                    >
                      {ctx}
                    </span>
                  ))}
                </div>
              )}

              {!isSimple &&
                result.modernUsage.notableReferences &&
                result.modernUsage.notableReferences.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-violet-100 dark:border-violet-800">
                    <p className="text-xs font-serif uppercase tracking-wider text-charcoal/50 mb-2">
                      Notable References
                    </p>
                    <ul className="space-y-1">
                      {result.modernUsage.notableReferences.slice(0, 3).map((reference, idx) => (
                        <li
                          key={`${reference}-${idx}`}
                          className="text-sm text-charcoal/70 leading-relaxed"
                        >
                          {reference}
                        </li>
                      ))}
                    </ul>
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
        {!isSimple && (
          <footer
            className="
            pt-6
            border-t border-charcoal/10
          "
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span
                className="
                font-serif text-xs uppercase
                text-charcoal-light/65 tracking-wider
                shrink-0
              "
              >
                Sources
              </span>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5 sm:gap-2">
                {result.sources.map((source, index) => (
                  <SourceBadge key={`${source.name}-${source.word || index}`} source={source} />
                ))}
              </div>
            </div>
          </footer>
        )}

        {/* Decorative flourish - centered card ending */}
        <div
          className="
            flex items-center justify-center gap-2
            mt-6 pt-2
            text-charcoal/25
          "
        >
          <span className="w-8 h-px bg-current" />
          <span className="text-xs font-serif italic select-none">§</span>
          <span className="w-8 h-px bg-current" />
        </div>
      </div>
    </article>
  )
})

function SourceBadge({ source }: { source: SourceReference }) {
  const labels: Record<string, string> = {
    etymonline: 'Etymonline',
    wiktionary: 'Wiktionary',
    freeDictionary: 'Free Dictionary',
    urbanDictionary: 'Urban Dictionary',
    incelsWiki: 'Incels Wiki',
    synthesized: 'AI Synthesis',
  }

  const colors: Record<string, string> = {
    etymonline:
      'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700 hover:bg-amber-100 hover:border-amber-300',
    wiktionary:
      'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-100 hover:border-blue-300',
    freeDictionary:
      'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 hover:border-emerald-300',
    urbanDictionary:
      'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700 hover:bg-violet-100 hover:border-violet-300',
    incelsWiki:
      'bg-stone-50 dark:bg-stone-950/40 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-100 hover:border-stone-300',
    synthesized:
      'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700',
  }

  const baseClasses = `
    px-2.5 py-1
    text-sm font-serif
    rounded-md
    border
    transition-colors duration-200
    ${colors[source.name] || 'bg-gray-50 dark:bg-gray-950/40 text-gray-700 dark:text-gray-300 border-gray-200'}
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

/**
 * Extract just the word from an LLM suggestion string.
 * Handles various LLM output patterns:
 *   "endure (to tolerate)" → { word: "endure", annotation: "to tolerate" }
 *   "ensure (to make certain)—inure means..." → { word: "ensure", annotation: "to make certain" }
 *   "habituate, meaning to accustom" → { word: "habituate" }
 *   "ad hoc" → { word: "ad hoc" }
 */
function parseWordEntry(raw: string): { word: string; annotation?: string } {
  let text = raw.trim()

  // 1. If there's a parenthetical, extract word before it and annotation inside
  const parenMatch = text.match(/^([^(]+?)\s*\(([^)]+)\)/)
  if (parenMatch) {
    return { word: parenMatch[1].trim(), annotation: parenMatch[2].trim() }
  }

  // 2. Split on em-dash, en-dash, or " - " and take the first part
  const dashParts = text.split(/\s*[—–]\s*|\s+-\s+/)
  if (dashParts.length > 1) {
    text = dashParts[0]
  }

  // 3. Split on comma followed by description-like text (not another word)
  //    "habituate, meaning to accustom" → "habituate"
  //    but "ice cream, gelato" should keep "ice cream"
  const commaMatch = text.match(/^([^,]+),\s*(meaning|i\.e\.|which|to\b|that\b)/i)
  if (commaMatch) {
    text = commaMatch[1]
  }

  // 4. Split on colon followed by description
  const colonMatch = text.match(/^([^:]+):\s*.{5,}/)
  if (colonMatch) {
    text = colonMatch[1]
  }

  // 5. If the result is unreasonably long (>40 chars), it's probably a sentence —
  //    take just the first word-like chunk
  text = text.trim()
  if (text.length > 40) {
    const firstWord = text.match(/^[\w\u00C0-\u024F]+(?:[\s-][\w\u00C0-\u024F]+)?/)
    if (firstWord) {
      text = firstWord[0]
    }
  }

  // 6. Strip trailing punctuation
  text = text.replace(/[.,;:!?]+$/, '').trim()

  return { word: text || raw.trim() }
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
    emerald:
      'border-emerald-200 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-300',
    rose: 'border-rose-200 hover:bg-rose-50 hover:border-rose-300',
    amber: 'border-amber-200 dark:border-amber-700 hover:bg-amber-50 hover:border-amber-300',
    blue: 'border-blue-200 dark:border-blue-700 hover:bg-blue-50 hover:border-blue-300',
    purple: 'border-purple-200 dark:border-purple-700 hover:bg-purple-50 hover:border-purple-300',
  }

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-2">
      <span className="text-xs font-serif uppercase tracking-wider text-charcoal/40 sm:w-32 sm:shrink-0">
        {label}
      </span>
      {words.map((raw) => {
        const { word, annotation } = parseWordEntry(raw)
        return (
          <button
            key={raw}
            onClick={() => onWordClick(word)}
            title={annotation}
            className={`
              px-2.5 py-1 text-sm font-serif text-charcoal/80
              border rounded-md transition-colors cursor-pointer
              ${colorClasses[color]}
            `}
          >
            {word}
          </button>
        )
      })}
    </div>
  )
}
