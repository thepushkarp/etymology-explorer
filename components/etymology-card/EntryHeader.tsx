'use client'

import { DisplayEtymologyResult } from '@/lib/types'
import { BETA_SYMBOL } from '@/lib/languages'
import { PronunciationButton } from '../PronunciationButton'

interface EntryHeaderProps {
  result: DisplayEtymologyResult
  headerActions?: React.ReactNode
  historySelector?: React.ReactNode
  usageUnavailable?: boolean
}

function shortenMeaning(meaning: string): string {
  return meaning.split(/[;,]/)[0].trim()
}

function shortenOrigin(origin: string): string {
  return origin.replace(/^Ancient\s+/i, '').replace(/^Old\s+/i, 'O.')
}

function buildOriginHook(result: DisplayEtymologyResult): string | null {
  if (!result.roots || result.roots.length === 0) return null

  const meaningful = result.roots.filter((r) => !r.root.startsWith('-')).slice(0, 3)

  if (meaningful.length === 0) return null

  const parts = meaningful.map(
    (root) => `${shortenOrigin(root.origin)} ${root.root} (${shortenMeaning(root.meaning)})`
  )

  return `From ${parts.join(' + ')}.`
}

export function EntryHeader({
  result,
  headerActions,
  historySelector,
  usageUnavailable = false,
}: EntryHeaderProps) {
  const originHook = buildOriginHook(result)
  const sectionLinks: Array<{ label: string; href: string }> = [
    { label: 'Ancestry', href: '#entry-ancestry' },
    { label: 'Story', href: '#entry-story' },
    ...(result.ngram?.data.length || usageUnavailable
      ? [{ label: 'Usage', href: '#entry-usage' }]
      : []),
    ...(result.suggestions ? [{ label: 'Related', href: '#entry-related' }] : []),
    ...(result.roots.length > 0 ? [{ label: 'Kin', href: '#entry-kin' }] : []),
    ...(result.rawSources?.wikipedia ? [{ label: 'Context', href: '#entry-context' }] : []),
    { label: 'Sources', href: '#entry-sources' },
  ]

  return (
    <header className="border-b border-border-soft pb-8 sm:pb-9">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft/70 pb-4">
        <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-charcoal-light/66">
          <span>entry</span>
          {result.language !== 'en' && (
            <span
              aria-label="Beta"
              className="normal-case rounded-full border border-accent-amber/45 px-2 py-0.5 font-serif tracking-normal text-accent-amber"
            >
              {BETA_SYMBOL}
            </span>
          )}
        </p>

        {headerActions && <div className="min-w-0 shrink-0">{headerActions}</div>}
      </div>

      <div className="mt-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
            <h1 className="min-w-0 break-words font-serif text-[clamp(2.7rem,13vw,4.5rem)] font-semibold leading-[0.98] tracking-[-0.06em] text-charcoal">
              {result.word}
            </h1>

            <span className="inline-flex items-center gap-1 pt-2 text-base italic text-charcoal-light sm:text-lg">
              {result.pronunciation}
              <PronunciationButton word={result.word} language={result.language} />
            </span>
          </div>

          {result.rawSources?.dateAttested && (
            <span className="editorial-chip mt-4 inline-flex items-center gap-1.5 bg-surface px-3 py-1 text-xs uppercase tracking-[0.16em] text-charcoal/72">
              First attested {result.rawSources.dateAttested}
            </span>
          )}
        </div>
      </div>

      {historySelector}

      <p className="mt-5 max-w-3xl font-serif text-lg leading-relaxed text-charcoal/88 sm:text-[1.35rem]">
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
              className="editorial-chip group inline-flex items-center gap-2 bg-surface px-3 py-1.5"
              title={definition}
            >
              <span className="text-xs uppercase tracking-[0.16em] text-charcoal/72">{pos}</span>
              {pronunciation && pronunciation !== result.pronunciation && (
                <span className="text-xs italic text-charcoal/62">{pronunciation}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <nav className="mt-6 flex flex-wrap gap-2">
        {sectionLinks.map(({ label, href }) => (
          <a key={href} href={href} className="editorial-chip font-serif italic">
            {label}
          </a>
        ))}
      </nav>
    </header>
  )
}
