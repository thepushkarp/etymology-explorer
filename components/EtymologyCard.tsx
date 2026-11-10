import type { ReactNode } from 'react'
import type { EtymologyEntry } from '@/lib/types'
import { StoryText } from '@/components/etymology-card/StoryText'
import { AncestryTree } from './AncestryTree'
import { ContextSection } from './etymology-card/ContextSection'
import { EntryHeader } from './etymology-card/EntryHeader'
import { ExamplesList } from './etymology-card/ExamplesSection'
import { KinSection } from './etymology-card/KinSection'
import { ModernUsageSection } from './etymology-card/ModernUsageSection'
import { RelatedWordsSection } from './etymology-card/RelatedWordsSection'
import { Section, Skeleton } from './etymology-card/Section'
import { ScholarlyReferences, SourcesSection } from './etymology-card/SourcesSection'
import { UsageSection } from './etymology-card/UsageSection'

interface EtymologyCardProps {
  result: EtymologyEntry
  /** Streaming: sections that have not arrived yet render as placeholders. */
  pending?: boolean
  usageUnavailable?: boolean
  actions?: ReactNode
  subheader?: ReactNode
}

export function EtymologyCard({
  result,
  pending = false,
  usageUnavailable = false,
  actions,
  subheader,
}: EtymologyCardProps) {
  const isEnglish = result.language === 'en'
  const hasAncestry = result.ancestryGraph.branches.length > 0
  const wikipedia = result.rawSources?.wikipedia

  return (
    <article aria-busy={pending}>
      <EntryHeader result={result} actions={actions} subheader={subheader} pending={pending} />

      {(hasAncestry || pending) && (
        <Section id="entry-ancestry" title="Lineage">
          {hasAncestry ? (
            <AncestryTree
              graph={result.ancestryGraph}
              word={result.word}
              language={result.language}
              definition={result.definition}
              transliteration={result.transliteration}
            />
          ) : (
            <Skeleton widths={['w-24', 'w-40', 'w-20', 'w-48', 'w-28']} />
          )}
        </Section>
      )}

      {(result.lore || pending) && (
        <Section id="entry-story" title="The story">
          {result.lore ? (
            <StoryText text={result.lore} />
          ) : (
            <Skeleton widths={['w-full', 'w-11/12', 'w-full', 'w-3/5']} />
          )}
        </Section>
      )}

      {(result.examples?.length || pending) && (
        <Section id="entry-examples" title="In use">
          {result.examples?.length ? (
            <ExamplesList examples={result.examples} language={result.language} />
          ) : (
            <Skeleton widths={['w-10/12', 'w-8/12']} />
          )}
        </Section>
      )}

      <UsageSection ngram={result.ngram} unavailable={usageUnavailable} />

      {result.modernUsage?.hasSlangMeaning && (
        <ModernUsageSection modernUsage={result.modernUsage} />
      )}

      {/* Suggestion strings carry no language identity, and word links resolve
          to English pages, so only English entries can offer them as links. */}
      {isEnglish && result.suggestions && <RelatedWordsSection suggestions={result.suggestions} />}

      <KinSection roots={result.roots} linkable={isEnglish} />

      {wikipedia && (
        <ContextSection
          extract={wikipedia}
          url={result.sources.find((source) => source.name === 'wikipedia')?.url}
        />
      )}

      <SourcesSection sources={result.sources} />

      {!pending && <ScholarlyReferences language={result.language} />}
    </article>
  )
}
