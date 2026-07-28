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
