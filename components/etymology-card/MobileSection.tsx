'use client'

import { useState } from 'react'

export const SECTION_TITLE_CLASS =
  'text-[11px] font-semibold uppercase tracking-[0.24em] text-charcoal-light/66'
export const SECTION_DIVIDER_CLASS = 'mt-10 border-t border-border-soft pt-8'
export const FIRST_SECTION_CLASS = 'mt-9 pt-1'

interface MobileSectionProps {
  children: React.ReactNode
  defaultOpenMobile?: boolean
  dividerClassName: string
  id?: string
  title: string
  titleTextClassName: string
}

export function MobileSection({
  children,
  defaultOpenMobile = false,
  dividerClassName,
  id,
  title,
  titleTextClassName,
}: MobileSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpenMobile)
  const contentId = id ? `${id}-content` : undefined

  return (
    <section id={id} className={dividerClassName}>
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-4 text-left"
          aria-expanded={isOpen}
          aria-controls={contentId}
        >
          <span className={titleTextClassName}>{title}</span>
          <svg
            className={`h-5 w-5 text-charcoal-light/70 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div id={contentId} className="pt-4 animate-fadeIn">
            {children}
          </div>
        )}
      </div>

      <div className="hidden md:block">
        <h2 className={`mb-4 ${titleTextClassName}`}>{title}</h2>
        {children}
      </div>
    </section>
  )
}
