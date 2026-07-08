'use client'

import type { NgramResult } from '@/lib/types'
import type { PartialEtymology } from '@/lib/streamReducer'
import { AncestrySection } from './etymology-card/AncestrySection'
import { KinSection } from './etymology-card/KinSection'
import {
  FIRST_SECTION_CLASS,
  MobileSection,
  SECTION_DIVIDER_CLASS,
  SECTION_TITLE_CLASS,
} from './etymology-card/MobileSection'
import { ModernUsageSection } from './etymology-card/ModernUsageSection'
import { RelatedWordsSection } from './etymology-card/RelatedWordsSection'
import { SourcesSection } from './etymology-card/SourcesSection'
import { StorySection } from './etymology-card/StorySection'
import { UsageSection } from './etymology-card/UsageSection'

interface StreamingEtymologyCardProps {
  /** The searched word — known before any section arrives */
  word: string
  sections: PartialEtymology
  ngram?: NgramResult | null
  onWordClick: (word: string) => void
}

/**
 * Progressive body of the EtymologyCard shown while synthesis streams.
 *
 * The persistent header lives in `TraceHeader` (mounted by
 * WordTraceExperience across both loading phases), so this component renders
 * only the body sections. Each hydrates as its `synthesis_section` event lands
 * (schema order: ancestry → story → related → sources); until then ancestry and
 * story show skeleton placeholders. The terminal `result` event swaps this card
 * for the enriched final one.
 */
export function StreamingEtymologyCard({
  word,
  sections,
  ngram,
  onWordClick,
}: StreamingEtymologyCardProps) {
  const resolvedWord = sections.word ?? word

  return (
    <div className="relative animate-fadeIn">
      {sections.ancestryGraph && sections.ancestryGraph.branches?.length > 0 ? (
        <AncestrySection graph={sections.ancestryGraph} word={resolvedWord} />
      ) : (
        <AncestrySkeleton />
      )}

      {sections.lore !== undefined ? <StorySection lore={sections.lore} /> : <StorySkeleton />}

      {ngram && ngram.data.length > 0 && <UsageSection ngram={ngram} />}

      {sections.modernUsage?.hasSlangMeaning && (
        <ModernUsageSection modernUsage={sections.modernUsage} />
      )}

      {sections.suggestions && (
        <RelatedWordsSection suggestions={sections.suggestions} onWordClick={onWordClick} />
      )}

      {sections.roots && sections.roots.length > 0 && (
        <KinSection roots={sections.roots} onWordClick={onWordClick} />
      )}

      {sections.sources && sections.sources.length > 0 && (
        <SourcesSection sources={sections.sources} />
      )}

      <div className="mt-6 flex items-center justify-center gap-2 pt-2 text-charcoal/25">
        <span className="w-8 h-px bg-current" />
        <span className="text-xs font-serif italic select-none">§</span>
        <span className="w-8 h-px bg-current" />
      </div>
    </div>
  )
}

function ShimmerBar({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse bg-charcoal/8 ${className}`} />
}

function AncestrySkeleton() {
  return (
    <MobileSection
      id="entry-ancestry"
      title="Word Ancestry"
      titleTextClassName={SECTION_TITLE_CLASS}
      dividerClassName={FIRST_SECTION_CLASS}
      defaultOpenMobile
    >
      <div className="editorial-card editorial-grid mt-2 p-5 sm:p-6">
        <div className="space-y-4 pt-1">
          <div className="flex items-center gap-4">
            <ShimmerBar className="h-9 w-9 shrink-0 rounded-[0.7rem]" />
            <ShimmerBar className="h-4 w-2/3 max-w-sm rounded-full" />
          </div>
          <div aria-hidden="true" className="ml-4 h-6 w-px bg-border-strong" />
          <div className="flex items-center gap-4">
            <ShimmerBar className="h-9 w-9 shrink-0 rounded-[0.7rem]" />
            <ShimmerBar className="h-4 w-1/2 max-w-xs rounded-full" />
          </div>
          <div aria-hidden="true" className="ml-4 h-6 w-px bg-border-strong" />
          <div className="flex items-center gap-4">
            <ShimmerBar className="h-9 w-9 shrink-0 rounded-[0.7rem]" />
            <ShimmerBar className="h-4 w-2/5 max-w-[16rem] rounded-full" />
          </div>
        </div>
      </div>
    </MobileSection>
  )
}

function StorySkeleton() {
  return (
    <MobileSection
      id="entry-story"
      title="The Story"
      titleTextClassName={SECTION_TITLE_CLASS}
      dividerClassName={SECTION_DIVIDER_CLASS}
      defaultOpenMobile
    >
      <div className="editorial-inset relative px-6 py-6">
        <div className="space-y-3 pl-4">
          <ShimmerBar className="h-4 w-full max-w-2xl rounded-full" />
          <ShimmerBar className="h-4 w-11/12 max-w-2xl rounded-full" />
          <ShimmerBar className="h-4 w-4/5 max-w-xl rounded-full" />
        </div>
      </div>
    </MobileSection>
  )
}
