'use client'

import { SourceReference } from '@/lib/types'
import { MobileSection, SECTION_DIVIDER_CLASS, SECTION_TITLE_CLASS } from './MobileSection'

interface SourcesSectionProps {
  sources: SourceReference[]
  title?: string
}

export const SOURCE_LABELS: Record<string, string> = {
  etymonline: 'Etymonline',
  wiktionary: 'Wiktionary',
  freeDictionary: 'Free Dictionary',
  urbanDictionary: 'Urban Dictionary',
  incelsWiki: 'Incels Wiki',
  wikipedia: 'Wikipedia',
  wiktionaryEnglish: 'English Wiktionary',
  wiktionaryNative: 'Native Wiktionary',
  wikidataLexeme: 'Wikidata Lexemes',
  multilingualDictionary: 'FreeDictionaryAPI',
  dicionarioAberto: 'Dicionário Aberto (historical)',
  synthesized: 'AI Synthesis',
}

function compareSourceReferences(a: SourceReference, b: SourceReference): number {
  const left = (a.word || a.url || SOURCE_LABELS[a.name] || a.name).toLocaleLowerCase()
  const right = (b.word || b.url || SOURCE_LABELS[b.name] || b.name).toLocaleLowerCase()

  return left.localeCompare(right)
}

function groupSourcesByOrigin(sources: SourceReference[]) {
  const grouped = new Map<string, SourceReference[]>()

  for (const source of sources) {
    const bucket = grouped.get(source.name)
    if (bucket) {
      bucket.push(source)
      continue
    }
    grouped.set(source.name, [source])
  }

  return Array.from(grouped.entries())
    .map(([name, entries]) => ({
      name,
      label: SOURCE_LABELS[name] || name,
      entries: [...entries].sort(compareSourceReferences),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function SourceBadge({ source }: { source: SourceReference }) {
  const colors: Record<string, string> = {
    etymonline:
      'border-accent-oxblood/40 bg-surface text-charcoal-light hover:bg-surface-muted hover:border-accent-oxblood/70',
    wiktionary:
      'border-accent-olive/40 bg-surface text-charcoal-light hover:bg-surface-muted hover:border-accent-olive/70',
    freeDictionary:
      'border-accent-sky/40 bg-surface text-charcoal-light hover:bg-surface-muted hover:border-accent-sky/70',
    urbanDictionary:
      'border-accent-amber/40 bg-surface text-charcoal-light hover:bg-surface-muted hover:border-accent-amber/70',
    incelsWiki:
      'border-accent-plum/40 bg-surface text-charcoal-light hover:bg-surface-muted hover:border-accent-plum/70',
    wikipedia:
      'border-accent-soft/40 bg-surface text-charcoal-light hover:bg-surface-muted hover:border-accent-soft/70',
    synthesized: 'border-accent-rose/40 bg-surface text-charcoal-light',
  }

  const baseClasses = `
    rounded-full border px-2.5 py-1 text-sm font-serif italic transition-colors duration-200
    ${colors[source.name] || 'border-border-soft bg-surface text-charcoal-light'}
  `

  const sourceLabel = SOURCE_LABELS[source.name] || source.name

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

export function SourcesSection({ sources, title = 'Sources' }: SourcesSectionProps) {
  if (sources.length === 0) return null

  const groupedSources = groupSourcesByOrigin(sources)

  return (
    <MobileSection
      id="entry-sources"
      title={title}
      titleTextClassName={SECTION_TITLE_CLASS}
      dividerClassName={SECTION_DIVIDER_CLASS}
    >
      <div className="editorial-card p-4 sm:p-5">
        <div className="space-y-4">
          {groupedSources.map((group) => (
            <div key={group.name}>
              <p className="text-[11px] uppercase tracking-[0.2em] text-charcoal-light/58">
                {group.label}
              </p>
              <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-2">
                {group.entries.map((source, index) => (
                  <SourceBadge
                    key={`${group.name}-${source.word || source.url || index}`}
                    source={source}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </MobileSection>
  )
}
