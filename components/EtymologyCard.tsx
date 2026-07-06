'use client'

import { memo } from 'react'
import { EtymologyResult } from '@/lib/types'
import HistoricalContext, { wikipediaSourceUrl } from './HistoricalContext'
import { AncestrySection } from './etymology-card/AncestrySection'
import { EntryHeader } from './etymology-card/EntryHeader'
import { KinSection } from './etymology-card/KinSection'
import { ModernUsageSection } from './etymology-card/ModernUsageSection'
import { RelatedWordsSection } from './etymology-card/RelatedWordsSection'
import { SourcesSection } from './etymology-card/SourcesSection'
import { StorySection } from './etymology-card/StorySection'
import { UsageSection } from './etymology-card/UsageSection'

interface EtymologyCardProps {
  result: EtymologyResult
  onWordClick: (word: string) => void
  isSimple?: boolean
  headerActions?: React.ReactNode
}

export const EtymologyCard = memo(function EtymologyCard({
  result,
  onWordClick,
  isSimple = false,
  headerActions,
}: EtymologyCardProps) {
  return (
    <article className="editorial-shell animate-fadeIn p-6 sm:p-8 md:p-12">
      <div className="relative">
        <EntryHeader result={result} isSimple={isSimple} headerActions={headerActions} />

        {result.ancestryGraph?.branches?.length > 0 && (
          <AncestrySection graph={result.ancestryGraph} word={result.word} isSimple={isSimple} />
        )}

        <StorySection lore={result.lore} />

        {result.ngram && result.ngram.data.length > 0 && <UsageSection ngram={result.ngram} />}

        {result.modernUsage && result.modernUsage.hasSlangMeaning && (
          <ModernUsageSection modernUsage={result.modernUsage} isSimple={isSimple} />
        )}

        {result.suggestions && (
          <RelatedWordsSection suggestions={result.suggestions} onWordClick={onWordClick} />
        )}

        {!isSimple && result.rawSources?.wikipedia && (
          <HistoricalContext
            wikipediaExtract={result.rawSources.wikipedia}
            sourceUrl={wikipediaSourceUrl(result.sources)}
          />
        )}

        {result.roots.length > 0 && <KinSection roots={result.roots} onWordClick={onWordClick} />}

        {!isSimple && <SourcesSection sources={result.sources} />}

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
