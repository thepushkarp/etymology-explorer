'use client'

import { NgramResult } from '@/lib/types'
import UsageTimeline from '../UsageTimeline'
import { MobileSection, SECTION_DIVIDER_CLASS, SECTION_TITLE_CLASS } from './MobileSection'

interface UsageSectionProps {
  ngram: NgramResult
  title?: string
}

export function UsageSection({ ngram, title = 'Usage over time' }: UsageSectionProps) {
  return (
    <MobileSection
      id="entry-usage"
      title={title}
      titleTextClassName={SECTION_TITLE_CLASS}
      dividerClassName={SECTION_DIVIDER_CLASS}
    >
      <div className="editorial-card p-4 sm:p-5">
        <UsageTimeline data={ngram.data} word={ngram.word} showYearLabels />
      </div>
    </MobileSection>
  )
}

interface UsageUnavailableProps {
  title?: string
  noteLabel?: string
  message?: string
}

export function UsageUnavailable({
  title = 'Usage over time',
  noteLabel = 'Corpus note',
  message = 'Usage history is not available for this corpus yet.',
}: UsageUnavailableProps) {
  return (
    <MobileSection
      id="entry-usage"
      title={title}
      titleTextClassName={SECTION_TITLE_CLASS}
      dividerClassName={SECTION_DIVIDER_CLASS}
    >
      <div className="max-w-3xl border-l-2 border-accent-amber/45 py-1 pl-4 sm:pl-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-charcoal-light/65">
          {noteLabel}
        </p>
        <p className="mt-2 font-serif text-base italic leading-relaxed text-charcoal-light sm:text-lg">
          {message}
        </p>
      </div>
    </MobileSection>
  )
}
