'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import CostModeIndicator from '@/components/CostModeIndicator'
import ThemeToggle from '@/components/ThemeToggle'

interface SiteHeaderProps {
  compact?: boolean
}

const NAV_LINKS = [
  { href: '/', label: 'Explore' },
  { href: '/learn/what-is-etymology', label: 'Learn' },
  { href: '/faq', label: 'FAQ' },
]

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  const pathname = usePathname()
  const desktopLinks = NAV_LINKS.filter((link) => link.href !== '/')

  const isActiveLink = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <header className="border-b border-border-soft/80 bg-surface/76 backdrop-blur-sm">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8">
        <div className={`flex items-center justify-between gap-6 ${compact ? 'py-3.5' : 'py-4.5'}`}>
          <Link
            href="/"
            className="flex shrink-0 items-baseline gap-2.5 transition-opacity hover:opacity-85"
          >
            <span className="font-serif text-[2rem] italic tracking-[-0.04em] text-charcoal">
              Etymology
            </span>
            <span className="font-serif text-[0.84rem] tracking-[0.22em] text-charcoal-light/72">
              Explorer
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {desktopLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[10.5px] uppercase tracking-[0.24em] text-charcoal-light/76 transition-colors hover:text-charcoal"
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

        <nav className="flex gap-2 overflow-x-auto pb-3 pl-[7.25rem] pr-1 md:hidden">
          {NAV_LINKS.map((link) => {
            const isActive = isActiveLink(link.href)

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-[11px] uppercase tracking-[0.22em] transition-colors ${
                  isActive
                    ? 'border-border-strong bg-surface text-charcoal shadow-sm'
                    : 'border-border-soft bg-surface/55 text-charcoal-light/76'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
