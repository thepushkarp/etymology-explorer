'use client'

import type { LanguageCode } from '@/lib/languages'
import { AncestryGraph } from '@/lib/types'
import { AncestryTree } from '../AncestryTree'
import { FIRST_SECTION_CLASS, MobileSection, SECTION_TITLE_CLASS } from './MobileSection'

interface AncestrySectionProps {
  graph: AncestryGraph
  word: string
  language?: LanguageCode
  title?: string
}

export function AncestrySection({
  graph,
  word,
  language = 'en',
  title = 'Word Ancestry',
}: AncestrySectionProps) {
  return (
    <MobileSection
      id="entry-ancestry"
      title={title}
      titleTextClassName={SECTION_TITLE_CLASS}
      dividerClassName={FIRST_SECTION_CLASS}
      defaultOpenMobile
    >
      <div className="editorial-card editorial-grid mt-2 p-3 sm:p-5">
        <div className="pt-1">
          <AncestryTree graph={graph} word={word} language={language} />
        </div>
      </div>
    </MobileSection>
  )
}
