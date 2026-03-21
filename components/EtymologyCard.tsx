'use client'

import { memo, useState } from 'react'
import { EtymologyResult, SourceReference } from '@/lib/types'
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

interface MobileSectionProps {
  children: React.ReactNode
  defaultOpenMobile?: boolean
  dividerClassName: string
  title: string
  titleTextClassName: string
}

function shortenMeaning(meaning: string): string {
  return meaning.split(/[;,]/)[0].trim()
}

function buildOriginHook(result: EtymologyResult): string | null {
  if (!result.roots || result.roots.length === 0) return null

  const rootSummary = result.roots
    .slice(0, 3)
    .map((root) => `${root.root} (${shortenMeaning(root.meaning)})`)
    .join(' + ')

  const originSummary = [...new Set(result.roots.map((root) => root.origin))].join(' + ')

  return `From ${originSummary} ${rootSummary}.`
}

function MobileSection({
  children,
  defaultOpenMobile = false,
  dividerClassName,
  title,
  titleTextClassName,
}: MobileSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpenMobile)

  return (
    <section className={dividerClassName}>
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-4 text-left"
          aria-expanded={isOpen}
        >
          <span className={titleTextClassName}>{title}</span>
          <svg
            className={`h-5 w-5 text-charcoal-light/70 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && <div className="pt-4 animate-fadeIn">{children}</div>}
      </div>

      <div className="hidden md:block">
        <h2 className={`mb-4 ${titleTextClassName}`}>{title}</h2>
        {children}
      </div>
    </section>
  )
}

export const EtymologyCard = memo(function EtymologyCard({
  result,
  onWordClick,
  isSimple = false,
  headerActions,
  ancestryTreeRef,
}: EtymologyCardProps) {
  const sectionTitleTextClassName =
    'text-[11px] font-semibold uppercase tracking-[0.24em] text-charcoal-light/72'
  const sectionDividerClassName = 'mt-10 border-t border-border-soft pt-10'
  const originHook = buildOriginHook(result)

  return (
    <article
      className="
        relative overflow-hidden rounded-[2rem] border border-border-soft bg-surface/92
        shadow-[0_28px_72px_-42px_var(--shadow-color)] animate-fadeIn
      "
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-cream-dark/45 to-transparent" />

      <div className="relative p-6 sm:p-8 md:p-12">
        <header className="mb-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
                <h1 className="font-serif text-4xl font-bold tracking-[-0.04em] text-charcoal md:text-6xl">
                  {result.word}
                </h1>

                <span className="inline-flex items-center gap-1 text-base italic text-charcoal-light sm:text-lg">
                  {!isSimple && result.pronunciation}
                  <PronunciationButton word={result.word} />
                </span>
              </div>

              {result.rawSources?.dateAttested && (
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-charcoal/18 bg-charcoal/8 px-2.5 py-1 text-xs text-charcoal/82 dark:border-charcoal/20 dark:bg-cream/12 dark:text-charcoal">
                  <span className="text-charcoal/40">⏱</span>
                  First attested {result.rawSources.dateAttested}
                </span>
              )}
            </div>

            {headerActions && <div className="shrink-0 pt-1">{headerActions}</div>}
          </div>

          <p className="mt-5 max-w-3xl font-serif text-lg leading-relaxed text-charcoal/82 sm:text-xl">
            {result.definition}
          </p>

          {originHook && (
            <p className="mt-3 max-w-3xl font-serif italic text-charcoal-light">{originHook}</p>
          )}

          {result.partsOfSpeech && result.partsOfSpeech.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {result.partsOfSpeech.map(({ pos, definition, pronunciation }, idx) => (
                <div
                  key={`${pos}-${idx}`}
                  className="group inline-flex items-center gap-2 rounded-full border border-charcoal/18 bg-charcoal/8 px-3 py-1.5 dark:border-charcoal/20 dark:bg-cream/12"
                  title={definition}
                >
                  <span className="text-xs uppercase tracking-[0.16em] text-charcoal/72 dark:text-charcoal/88">
                    {pos}
                  </span>
                  {pronunciation && pronunciation !== result.pronunciation && (
                    <span className="text-xs italic text-charcoal/62 dark:text-charcoal/76">
                      {pronunciation}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </header>

        {result.ancestryGraph?.branches?.length > 0 && (
          <div ref={ancestryTreeRef}>
            <MobileSection
              title="Etymological Journey"
              titleTextClassName={sectionTitleTextClassName}
              dividerClassName={sectionDividerClassName}
              defaultOpenMobile
            >
              <AncestryTree graph={result.ancestryGraph} word={result.word} isSimple={isSimple} />
            </MobileSection>
          </div>
        )}

        <MobileSection
          title="The Story"
          titleTextClassName={sectionTitleTextClassName}
          dividerClassName={sectionDividerClassName}
          defaultOpenMobile
        >
          <div className="relative pl-7">
            <div className="absolute bottom-0 left-1 top-2 w-px bg-gradient-to-b from-charcoal/35 via-charcoal/18 to-transparent" />
            <span
              className="
              absolute -left-2.5 -top-3 select-none font-serif text-4xl text-charcoal/20
            "
            >
              &ldquo;
            </span>

            <p className="max-w-3xl font-serif text-lg leading-relaxed text-charcoal/90 italic">
              {result.lore}
            </p>
          </div>
        </MobileSection>

        {result.ngram && result.ngram.data.length > 0 && (
          <MobileSection
            title="Usage over time"
            titleTextClassName={sectionTitleTextClassName}
            dividerClassName={sectionDividerClassName}
          >
            <div className="rounded-[1.5rem] border border-border-soft bg-cream-dark/28 p-4 sm:p-5">
              <UsageTimeline data={result.ngram.data} word={result.ngram.word} showYearLabels />
            </div>
          </MobileSection>
        )}

        {result.modernUsage && result.modernUsage.hasSlangMeaning && (
          <MobileSection
            title="Modern Usage"
            titleTextClassName={sectionTitleTextClassName}
            dividerClassName={sectionDividerClassName}
          >
            <div className="relative rounded-[1.4rem] border border-border-soft bg-cream-dark/22 p-5">
              {result.modernUsage.slangDefinition && (
                <p className="mb-3 font-serif text-lg leading-relaxed text-charcoal/82">
                  {result.modernUsage.slangDefinition}
                </p>
              )}
              {result.modernUsage.popularizedBy && (
                <p className="mb-2 text-sm text-charcoal/60">
                  <span className="font-medium">Popularized by:</span>{' '}
                  {result.modernUsage.popularizedBy}
                </p>
              )}
              {result.modernUsage.contexts && result.modernUsage.contexts.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {result.modernUsage.contexts.map((ctx) => (
                    <span
                      key={ctx}
                      className="rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-xs text-violet-900 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
                    >
                      {ctx}
                    </span>
                  ))}
                </div>
              )}

              {!isSimple &&
                result.modernUsage.notableReferences &&
                result.modernUsage.notableReferences.length > 0 && (
                  <div className="mt-5 border-t border-border-soft pt-5">
                    <p className="mb-2 text-xs uppercase tracking-[0.16em] text-charcoal/50">
                      Notable References
                    </p>
                    <ul className="space-y-1">
                      {result.modernUsage.notableReferences.slice(0, 3).map((reference, idx) => (
                        <li
                          key={`${reference}-${idx}`}
                          className="text-sm leading-relaxed text-charcoal/70"
                        >
                          {reference}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          </MobileSection>
        )}

        {result.suggestions && (
          <MobileSection
            title="Related Words"
            titleTextClassName={sectionTitleTextClassName}
            dividerClassName={sectionDividerClassName}
          >
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
          </MobileSection>
        )}

        {!isSimple && result.rawSources?.wikipedia && (
          <HistoricalContext wikipediaExtract={result.rawSources.wikipedia} />
        )}

        {!isSimple && (
          <MobileSection
            title="Sources"
            titleTextClassName={sectionTitleTextClassName}
            dividerClassName={sectionDividerClassName}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span
                className="
                text-xs uppercase tracking-[0.16em] text-charcoal-light/65
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
          </MobileSection>
        )}

        <div
          className="
            mt-6 flex items-center justify-center gap-2 pt-2 text-charcoal/25
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
      'border-amber-300 bg-amber-100 text-amber-950 hover:bg-amber-200 hover:border-amber-400 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/55',
    wiktionary:
      'border-blue-300 bg-blue-100 text-blue-950 hover:bg-blue-200 hover:border-blue-400 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-100 dark:hover:bg-blue-900/55',
    freeDictionary:
      'border-emerald-300 bg-emerald-100 text-emerald-950 hover:bg-emerald-200 hover:border-emerald-400 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-100 dark:hover:bg-emerald-900/55',
    urbanDictionary:
      'border-violet-300 bg-violet-100 text-violet-950 hover:bg-violet-200 hover:border-violet-400 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-100 dark:hover:bg-violet-900/55',
    incelsWiki:
      'border-stone-300 bg-stone-100 text-stone-900 hover:bg-stone-200 hover:border-stone-400 dark:border-stone-600 dark:bg-stone-800/50 dark:text-stone-100 dark:hover:bg-stone-800/70',
    synthesized:
      'border-purple-300 bg-purple-100 text-purple-950 dark:border-purple-700 dark:bg-purple-900/40 dark:text-purple-100',
  }

  const baseClasses = `
    rounded-full border px-2.5 py-1 text-sm font-serif transition-colors duration-200
    ${colors[source.name] || 'border-gray-300 bg-gray-100 text-gray-900 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-100'}
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
      'border-emerald-300 bg-emerald-100/95 text-emerald-950 hover:bg-emerald-200 hover:border-emerald-400 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-100 dark:hover:bg-emerald-900/58',
    rose: 'border-rose-300 bg-rose-100/95 text-rose-950 hover:bg-rose-200 hover:border-rose-400 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-100 dark:hover:bg-rose-900/58',
    amber:
      'border-amber-300 bg-amber-100/95 text-amber-950 hover:bg-amber-200 hover:border-amber-400 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/58',
    blue: 'border-blue-300 bg-blue-100/95 text-blue-950 hover:bg-blue-200 hover:border-blue-400 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-100 dark:hover:bg-blue-900/58',
    purple:
      'border-purple-300 bg-purple-100/95 text-purple-950 hover:bg-purple-200 hover:border-purple-400 dark:border-purple-700 dark:bg-purple-900/40 dark:text-purple-100 dark:hover:bg-purple-900/58',
  }

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
      <span className="w-full text-xs uppercase tracking-[0.16em] text-charcoal/42 sm:w-32 sm:shrink-0">
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
              cursor-pointer rounded-full border px-2.5 py-1 text-sm font-serif
              transition-colors
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
