'use client'

import { AncestryGraph } from '@/lib/types'
import { AncestryTree } from '../AncestryTree'
import { FIRST_SECTION_CLASS, MobileSection, SECTION_TITLE_CLASS } from './MobileSection'

interface AncestrySectionProps {
  graph: AncestryGraph
  word: string
}

export function AncestrySection({ graph, word }: AncestrySectionProps) {
  return (
    <MobileSection
      id="entry-ancestry"
      title="Word Ancestry"
      titleTextClassName={SECTION_TITLE_CLASS}
      dividerClassName={FIRST_SECTION_CLASS}
      defaultOpenMobile
    >
      <div className="editorial-card editorial-grid mt-2 p-5 sm:p-6">
        <div className="pt-1">
          <AncestryTree graph={graph} word={word} />
        </div>
      </div>
    </MobileSection>
  )
}
