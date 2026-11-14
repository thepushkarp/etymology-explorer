'use client'

import Link from 'next/link'
import { SearchBox } from '@/components/SearchBox'
import { LanguageSelect } from '@/components/LanguageSelect'
import { ThemeToggle } from '@/components/ThemeToggle'
import { VersionInfo } from '@/components/VersionInfo'
import { useSearchLanguage } from '@/lib/hooks/useSearchLanguage'

interface SiteHeaderProps {
  /** The landing page supplies its own search field. */
  showSearch?: boolean
}

function HeaderSearch() {
  const [language, setLanguage] = useSearchLanguage()
  return (
    <div className="flex w-full items-start gap-2">
      <SearchBox language={language} />
      <LanguageSelect value={language} onChange={setLanguage} compact />
    </div>
  )
}

export function SiteHeader({ showSearch }: SiteHeaderProps) {
  return (
    <header className="mx-auto grid w-full max-w-3xl grid-cols-[1fr_auto] items-center gap-3 px-4 pt-5 sm:flex sm:gap-6 sm:px-6 sm:pt-7">
      <Link
        href="/"
        className="shrink-0 font-serif text-xl italic tracking-tight text-ink transition-colors hover:text-accent focus-visible:text-accent sm:mr-auto"
      >
        <span className="text-accent">Etym</span>Ex
      </Link>
      {showSearch && (
        <div className="order-last col-span-2 min-w-0 sm:order-none sm:max-w-sm sm:flex-1">
          <HeaderSearch />
        </div>
      )}
      <div className="flex shrink-0 items-center gap-4">
        <VersionInfo />
        <ThemeToggle />
      </div>
    </header>
  )
}
