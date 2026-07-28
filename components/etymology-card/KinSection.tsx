'use client'

import { Root } from '@/lib/types'
import { RelatedWordsList } from '../RelatedWordsList'
import { MobileSection, SECTION_DIVIDER_CLASS, SECTION_TITLE_CLASS } from './MobileSection'

interface KinSectionProps {
  roots: Root[]
  onWordClick: (word: string) => void
  title?: string
}

export function KinSection({ roots, onWordClick, title = 'Kin & Kindred' }: KinSectionProps) {
  return (
    <MobileSection
      id="entry-kin"
      title={title}
      titleTextClassName={SECTION_TITLE_CLASS}
      dividerClassName={SECTION_DIVIDER_CLASS}
    >
      <RelatedWordsList roots={roots} onWordClick={onWordClick} />
    </MobileSection>
  )
}
