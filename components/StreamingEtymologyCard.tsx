'use client'

import type { NgramResult } from '@/lib/types'
import type { PartialEtymology } from '@/lib/streamReducer'
import { AncestrySection } from './etymology-card/AncestrySection'
import { EntryHeader } from './etymology-card/EntryHeader'
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
 * Progressive shell of the EtymologyCard shown while synthesis streams.
 * Each section component hydrates as its `synthesis_section` event lands
 * (schema order: header fields → ancestry → story → related → sources);
 * until then the header, ancestry, and story show skeleton placeholders.
 * The terminal `result` event swaps this card for the enriched final one.
 */
export function StreamingEtymologyCard({
  word,
  sections,
  ngram,
  onWordClick,
}: StreamingEtymologyCardProps) {
  // `definition` is the third schema key: once it closes, word and
  // pronunciation have closed too and the real header can render.
  const headerReady = sections.definition !== undefined

  const partialResult = {
    word: sections.word ?? word,
    pronunciation: sections.pronunciation ?? '',
    definition: sections.definition ?? '',
    roots: sections.roots ?? [],
    ancestryGraph: sections.ancestryGraph ?? { branches: [] },
    lore: sections.lore ?? '',
    sources: sections.sources ?? [],
    partsOfSpeech: sections.partsOfSpeech,
    suggestions: sections.suggestions,
    modernUsage: sections.modernUsage,
    ngram: ngram ?? undefined,
  }

  return (
    <article aria-busy="true" className="editorial-shell animate-fadeIn p-6 sm:p-8 md:p-12">
      <div className="relative">
        {headerReady ? <EntryHeader result={partialResult} /> : <HeaderSkeleton word={word} />}

        {sections.ancestryGraph && sections.ancestryGraph.branches?.length > 0 ? (
          <AncestrySection graph={sections.ancestryGraph} word={partialResult.word} />
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
    </article>
  )
}

function ShimmerBar({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse bg-charcoal/8 ${className}`} />
}

function HeaderSkeleton({ word }: { word: string }) {
  return (
    <header className="border-b border-border-soft pb-10">
      <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">entry</p>
      <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
        <h1 className="mt-3 font-serif text-5xl font-semibold tracking-[-0.06em] text-charcoal md:text-7xl">
          {word}
        </h1>
        <ShimmerBar className="h-5 w-28 rounded-full" />
      </div>
      <div className="mt-7 space-y-3">
        <ShimmerBar className="h-6 w-3/4 max-w-xl rounded-full" />
        <ShimmerBar className="h-4 w-1/2 max-w-md rounded-full" />
      </div>
    </header>
  )
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
