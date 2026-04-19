'use client'

import Link from 'next/link'
import CostModeIndicator from '@/components/CostModeIndicator'
import ThemeToggle from '@/components/ThemeToggle'

interface SiteHeaderProps {
  compact?: boolean
}

const NAV_LINKS = [
  { href: '/learn/what-is-etymology', label: 'Learn' },
  { href: '/faq', label: 'FAQ' },
]

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  return (
    <header className="border-b border-border-soft/80 bg-surface/80 backdrop-blur-sm">
      <div
        className={`mx-auto flex max-w-[1180px] items-center justify-between gap-6 px-4 sm:px-6 lg:px-8 ${
          compact ? 'py-4' : 'py-5'
        }`}
      >
        <Link
          href="/"
          className="flex shrink-0 items-baseline gap-2 transition-opacity hover:opacity-85"
        >
          <span className="font-serif text-[2rem] italic tracking-[-0.04em] text-charcoal">
            Etymology
          </span>
          <span className="font-serif text-[0.9rem] tracking-[0.18em] text-charcoal-light/72">
            Explorer
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[11px] uppercase tracking-[0.22em] text-charcoal-light/76 transition-colors hover:text-charcoal"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <CostModeIndicator />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
