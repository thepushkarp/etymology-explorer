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

function shortenOrigin(origin: string): string {
  return origin.replace(/^Ancient\s+/i, '').replace(/^Old\s+/i, 'O.')
}

function buildOriginHook(result: EtymologyResult): string | null {
  if (!result.roots || result.roots.length === 0) return null

  const meaningful = result.roots.filter((r) => !r.root.startsWith('-')).slice(0, 3)

  if (meaningful.length === 0) return null

  const parts = meaningful.map(
    (root) => `${shortenOrigin(root.origin)} ${root.root} (${shortenMeaning(root.meaning)})`
  )

  return `From ${parts.join(' + ')}.`
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
}: EtymologyCardProps) {
  const sectionTitleTextClassName =
    'text-[11px] font-semibold uppercase tracking-[0.24em] text-charcoal-light/66'
  const sectionDividerClassName = 'mt-12 border-t border-border-soft pt-10'
  const firstSectionClassName = 'mt-12 pt-2'
  const originHook = buildOriginHook(result)

  return (
    <article className="editorial-panel animate-fadeIn p-6 sm:p-8 md:p-12">
      <div className="relative">
        <header className="border-b border-border-soft pb-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
                entry
              </p>
              <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
                <h1 className="mt-3 font-serif text-5xl font-bold tracking-[-0.05em] text-charcoal md:text-7xl">
                  {result.word}
                </h1>

                <span className="inline-flex items-center gap-1 pt-2 text-base italic text-charcoal-light sm:text-lg">
                  {!isSimple && result.pronunciation}
                  <PronunciationButton word={result.word} />
                </span>
              </div>

              {result.rawSources?.dateAttested && (
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-surface px-3 py-1 text-xs uppercase tracking-[0.16em] text-charcoal/72">
                  First attested {result.rawSources.dateAttested}
                </span>
              )}
            </div>

            {headerActions && <div className="shrink-0 pt-1 md:pt-4">{headerActions}</div>}
          </div>

          <p className="mt-6 max-w-3xl font-serif text-xl leading-relaxed text-charcoal/84 sm:text-2xl">
            {result.definition}
          </p>

          {originHook && (
            <p className="mt-4 max-w-3xl font-serif italic leading-relaxed text-charcoal-light">
              {originHook}
            </p>
          )}

          {result.partsOfSpeech && result.partsOfSpeech.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {result.partsOfSpeech.map(({ pos, definition, pronunciation }, idx) => (
                <div
                  key={`${pos}-${idx}`}
                  className="group inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface px-3 py-1.5"
                  title={definition}
                >
                  <span className="text-xs uppercase tracking-[0.16em] text-charcoal/72">
                    {pos}
                  </span>
                  {pronunciation && pronunciation !== result.pronunciation && (
                    <span className="text-xs italic text-charcoal/62">{pronunciation}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </header>

        {result.ancestryGraph?.branches?.length > 0 && (
          <MobileSection
            title="Ancestry"
            titleTextClassName={sectionTitleTextClassName}
            dividerClassName={firstSectionClassName}
            defaultOpenMobile
          >
            <div className="editorial-panel mt-2 p-5 sm:p-6">
              <div className="border-b border-border-soft pb-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
                  ancestry map
                </p>
                <p className="mt-3 max-w-2xl font-serif text-lg italic leading-relaxed text-charcoal-light">
                  The main line of descent comes first: roots, convergences, and the point where the
                  modern word emerges.
                </p>
              </div>
              <div className="pt-6">
                <AncestryTree graph={result.ancestryGraph} word={result.word} isSimple={isSimple} />
              </div>
            </div>
          </MobileSection>
        )}

        <MobileSection
          title="The Story"
          titleTextClassName={sectionTitleTextClassName}
          dividerClassName={sectionDividerClassName}
          defaultOpenMobile
        >
          <div className="relative rounded-[1rem] bg-surface/58 px-6 py-6">
            <div className="absolute bottom-6 left-4 top-6 w-px bg-gradient-to-b from-charcoal/35 via-charcoal/18 to-transparent" />
            <span
              className="
              absolute left-1 top-2 select-none font-serif text-4xl text-charcoal/20
            "
            >
              &ldquo;
            </span>

            <p className="pl-4 font-serif text-lg leading-relaxed text-charcoal/90 italic">
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
            <div className="rounded-[1rem] border border-border-soft bg-surface/62 p-4 sm:p-5">
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
            <div className="relative rounded-[1rem] border border-border-soft bg-surface/62 p-5">
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
                      className="rounded-full border border-[#9c88a2] bg-[#eae2ec] px-2 py-0.5 text-xs text-[#564060] dark:border-[#6a5672] dark:bg-[#262028] dark:text-[#c8b2cc]"
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
            <div className="rounded-[1rem] border border-border-soft bg-surface/62 p-4 sm:p-5">
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
                  References
                </p>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-light">
                  These are the source pages used to ground the reading above.
                </p>
              </div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-2">
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
      'border-[#c4a06a] bg-[#f0e8db] text-[#6a5530] hover:bg-[#e8dece] hover:border-[#b89358] dark:border-[#8a6d40] dark:bg-[#262019] dark:text-[#d4b878] dark:hover:bg-[#302818]',
    wiktionary:
      'border-[#88a0b8] bg-[#e4e8ee] text-[#405468] hover:bg-[#d8dee8] hover:border-[#7892ac] dark:border-[#52687a] dark:bg-[#1f2328] dark:text-[#a8bed0] dark:hover:bg-[#262c32]',
    freeDictionary:
      'border-[#8fa486] bg-[#e6eae2] text-[#465340] hover:bg-[#dce2d6] hover:border-[#7e9674] dark:border-[#586a50] dark:bg-[#202620] dark:text-[#b4c5a6] dark:hover:bg-[#282e26]',
    urbanDictionary:
      'border-[#9c88a2] bg-[#eae2ec] text-[#564060] hover:bg-[#e0d6e2] hover:border-[#8e7894] dark:border-[#6a5672] dark:bg-[#262028] dark:text-[#c8b2cc] dark:hover:bg-[#2e2832]',
    incelsWiki:
      'border-[#baa88e] bg-[#ece6dc] text-[#5e5040] hover:bg-[#e4dcd0] hover:border-[#ac9a7e] dark:border-[#6a5c48] dark:bg-[#262018] dark:text-[#d0c0a8] dark:hover:bg-[#2e2820]',
    synthesized:
      'border-[#9c88a2] bg-[#eae2ec] text-[#564060] dark:border-[#6a5672] dark:bg-[#262028] dark:text-[#c8b2cc]',
  }

  const baseClasses = `
    rounded-full border px-2.5 py-1 text-sm font-serif transition-colors duration-200
    ${colors[source.name] || 'border-[#baa88e] bg-[#ece6dc] text-[#5e5040] dark:border-[#6a5c48] dark:bg-[#262018] dark:text-[#d0c0a8]'}
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
      'border-[#8fa486] bg-[#e6eae2] text-[#465340] hover:bg-[#dce2d6] hover:border-[#7e9674] dark:border-[#586a50] dark:bg-[#202620] dark:text-[#b4c5a6] dark:hover:bg-[#282e26]',
    rose: 'border-[#bf8a7a] bg-[#ede2dc] text-[#6a4a3c] hover:bg-[#e4d6ce] hover:border-[#b07a6a] dark:border-[#7a5548] dark:bg-[#2a201e] dark:text-[#d4a898] dark:hover:bg-[#322826]',
    amber:
      'border-[#c4a06a] bg-[#f0e8db] text-[#6a5530] hover:bg-[#e8dece] hover:border-[#b89358] dark:border-[#8a6d40] dark:bg-[#262019] dark:text-[#d4b878] dark:hover:bg-[#302818]',
    blue: 'border-[#88a0b8] bg-[#e4e8ee] text-[#405468] hover:bg-[#d8dee8] hover:border-[#7892ac] dark:border-[#52687a] dark:bg-[#1f2328] dark:text-[#a8bed0] dark:hover:bg-[#262c32]',
    purple:
      'border-[#9c88a2] bg-[#eae2ec] text-[#564060] hover:bg-[#e0d6e2] hover:border-[#8e7894] dark:border-[#6a5672] dark:bg-[#262028] dark:text-[#c8b2cc] dark:hover:bg-[#2e2832]',
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
