'use client'

import Link from 'next/link'
import CostModeIndicator from '@/components/CostModeIndicator'
import SimpleModeToggle from '@/components/SimpleModeToggle'
import ThemeToggle from '@/components/ThemeToggle'

interface SiteHeaderProps {
  compact?: boolean
  isSimple?: boolean
  onToggleSimpleMode?: () => void
}

export function SiteHeader({ compact = false, isSimple, onToggleSimpleMode }: SiteHeaderProps) {
  return (
    <header className="border-b border-border-soft/80 bg-surface/76 backdrop-blur-sm">
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8">
        <div
          className={`flex items-center justify-between gap-3 sm:gap-6 ${
            compact ? 'py-3.5' : 'py-3.5 sm:py-4.5'
          }`}
        >
          <Link
            href="/"
            aria-label="Etymology Explorer home"
            className="flex shrink-0 flex-col font-serif font-semibold italic leading-[0.88] tracking-[-0.06em] text-charcoal transition-opacity hover:opacity-85"
          >
            <span aria-hidden="true" className="block text-[clamp(1.5rem,6.6vw,1.95rem)]">
              <span className="text-accent-oxblood">Etym</span>ology
            </span>
            <span aria-hidden="true" className="block text-[clamp(1.5rem,6.6vw,1.95rem)]">
              <span className="text-accent-oxblood">Ex</span>plorer
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {isSimple !== undefined && onToggleSimpleMode && (
              <SimpleModeToggle isSimple={isSimple} onToggle={onToggleSimpleMode} />
            )}
            <CostModeIndicator />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
