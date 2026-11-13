'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { SearchBox } from '@/components/SearchBox'
import { LanguageSelect } from '@/components/LanguageSelect'
import { ThemeToggle } from '@/components/ThemeToggle'
import { VersionInfo } from '@/components/VersionInfo'
import { isLanguageCode, type LanguageCode } from '@/lib/languages'

interface SiteHeaderProps {
  /** The landing page supplies its own search field. */
  showSearch?: boolean
  searchLanguage?: LanguageCode
}

function HeaderSearch({ initialLanguage }: { initialLanguage?: LanguageCode }) {
  const [language, setLanguage] = useState(initialLanguage)
  return (
    <div className="flex w-full items-start gap-2">
      <SearchBox language={language} />
      <LanguageSelect value={language} onChange={setLanguage} compact />
    </div>
  )
}

export function SiteHeader({ showSearch, searchLanguage }: SiteHeaderProps) {
  const segments = usePathname()?.split('/') ?? []
  const routeLanguage =
    segments[1] === 'word' && segments.length === 4 && isLanguageCode(segments[2])
      ? segments[2]
      : searchLanguage
  return (
    <header className="mx-auto grid w-full max-w-3xl grid-cols-[1fr_auto] items-center gap-3 px-4 pt-5 sm:flex sm:gap-6 sm:px-6 sm:pt-7">
      <Link
        href="/"
        className="shrink-0 font-serif text-xl italic tracking-tight text-ink transition-colors hover:text-accent sm:mr-auto"
      >
        EtymEx
      </Link>
      {(showSearch || searchLanguage) && (
        <div className="order-last col-span-2 min-w-0 sm:order-none sm:max-w-sm sm:flex-1">
          <HeaderSearch key={routeLanguage ?? 'auto'} initialLanguage={routeLanguage} />
        </div>
      )}
      <div className="flex shrink-0 items-center gap-4">
        <VersionInfo />
        <ThemeToggle />
      </div>
    </header>
  )
}
