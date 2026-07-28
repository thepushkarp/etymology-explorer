'use client'

import { MobileSection, SECTION_DIVIDER_CLASS, SECTION_TITLE_CLASS } from './MobileSection'

interface StorySectionProps {
  lore: string
  title?: string
}

export function StorySection({ lore, title = 'The Story' }: StorySectionProps) {
  return (
    <MobileSection
      id="entry-story"
      title={title}
      titleTextClassName={SECTION_TITLE_CLASS}
      dividerClassName={SECTION_DIVIDER_CLASS}
      defaultOpenMobile
    >
      <div className="editorial-inset relative px-6 py-6">
        <div className="absolute bottom-6 left-4 top-6 w-px bg-gradient-to-b from-charcoal/35 via-charcoal/18 to-transparent" />
        <span
          className="
          absolute left-1 top-2 select-none font-serif text-4xl text-charcoal/20
        "
        >
          &ldquo;
        </span>

        <p className="pl-4 font-serif text-lg leading-relaxed text-charcoal/90 italic">{lore}</p>
      </div>
    </MobileSection>
  )
}
