import type { ReactNode } from 'react'
import type { DisplayEtymologyResult } from '@/lib/types'
import type { BetaLanguageCode } from '@/lib/languages'
import { resultLabels, type ResultLocale } from '@/lib/resultLocalization'
import { AncestryTree } from './AncestryTree'
import { ContextSection } from './etymology-card/ContextSection'
import { EntryHeader } from './etymology-card/EntryHeader'
import { KinSection } from './etymology-card/KinSection'
import { ModernUsageSection } from './etymology-card/ModernUsageSection'
import { RelatedWordsSection } from './etymology-card/RelatedWordsSection'
import { Section, Skeleton } from './etymology-card/Section'
import { ScholarlyReferences, SourcesSection } from './etymology-card/SourcesSection'
import { UsageSection } from './etymology-card/UsageSection'

interface EtymologyCardProps {
  result: DisplayEtymologyResult
  /** Streaming: sections that have not arrived yet render as placeholders. */
  pending?: boolean
  contentLocale?: ResultLocale
  usageUnavailable?: boolean
  actions?: ReactNode
  subheader?: ReactNode
}

export function EtymologyCard({
  result,
  pending = false,
  contentLocale = 'en',
  usageUnavailable = false,
  actions,
  subheader,
}: EtymologyCardProps) {
  const isEnglish = result.language === 'en'
  const labels = resultLabels(result.language, contentLocale)
  const hasAncestry = result.ancestryGraph.branches.length > 0
  const wikipedia = result.rawSources?.wikipedia

  return (
    <article aria-busy={pending}>
      <EntryHeader result={result} actions={actions} subheader={subheader} pending={pending} />

      {(hasAncestry || pending) && (
        <Section id="entry-ancestry" title={labels.ancestry}>
          {hasAncestry ? (
            <AncestryTree
              graph={result.ancestryGraph}
              word={result.word}
              language={result.language}
            />
          ) : (
            <Skeleton widths={['w-24', 'w-40', 'w-20', 'w-48', 'w-28']} />
          )}
        </Section>
      )}

      {(result.lore || pending) && (
        <Section id="entry-story" title={labels.story}>
          {result.lore ? (
            <p className="max-w-2xl font-serif text-lg leading-[1.8] text-ink">{result.lore}</p>
          ) : (
            <Skeleton widths={['w-full', 'w-11/12', 'w-full', 'w-3/5']} />
          )}
        </Section>
      )}

      <UsageSection
        ngram={result.ngram}
        unavailable={usageUnavailable}
        title={labels.usage}
        unavailableMessage={labels.usageUnavailable}
      />

      {result.modernUsage?.hasSlangMeaning && (
        <ModernUsageSection modernUsage={result.modernUsage} title={labels.modernUsage} />
      )}

      {result.suggestions && (
        <RelatedWordsSection suggestions={result.suggestions} title={labels.related} />
      )}

      <KinSection roots={result.roots} linkable={isEnglish} title={labels.kin} />

      {wikipedia && (
        <ContextSection
          extract={wikipedia}
          url={result.sources.find((source) => source.name === 'wikipedia')?.url}
        />
      )}

      <SourcesSection sources={result.sources} title={labels.sources} />

      {!isEnglish && !pending && (
        <ScholarlyReferences
          language={result.language as BetaLanguageCode}
          title={labels.references}
        />
      )}
    </article>
  )
}
