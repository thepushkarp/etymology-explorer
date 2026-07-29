'use client'

import {
  FIRST_SECTION_CLASS,
  MobileSection,
  SECTION_DIVIDER_CLASS,
  SECTION_TITLE_CLASS,
} from './MobileSection'

interface StorySectionProps {
  lore: string
  title?: string
  first?: boolean
}

export function StorySection({ lore, title = 'The Story', first = false }: StorySectionProps) {
  return (
    <MobileSection
      id="entry-story"
      title={title}
      titleTextClassName={SECTION_TITLE_CLASS}
      dividerClassName={first ? FIRST_SECTION_CLASS : SECTION_DIVIDER_CLASS}
      defaultOpenMobile
    >
      <div className="editorial-inset relative px-4 py-5 sm:px-6 sm:py-6">
        <div className="absolute bottom-6 left-4 top-6 w-px bg-gradient-to-b from-charcoal/35 via-charcoal/18 to-transparent" />
        <span
          className="
          absolute left-1 top-2 select-none font-serif text-4xl text-charcoal/20
        "
        >
          &ldquo;
        </span>

        <p className="pl-3 font-serif text-base italic leading-[1.72] text-charcoal/92 sm:pl-4 sm:text-lg">
          {lore}
        </p>
      </div>
    </MobileSection>
  )
}
