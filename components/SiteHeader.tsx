import Link from 'next/link'
import { SearchBox } from '@/components/SearchBox'
import { ThemeToggle } from '@/components/ThemeToggle'
import type { LanguageCode } from '@/lib/languages'

interface SiteHeaderProps {
  /** Show the compact search field; the landing page has its own. */
  searchLanguage?: LanguageCode
}

export function SiteHeader({ searchLanguage }: SiteHeaderProps) {
  return (
    <header className="mx-auto flex w-full max-w-3xl items-center gap-6 px-4 pt-5 sm:px-6 sm:pt-7">
      <Link
        href="/"
        className="shrink-0 font-serif text-xl italic tracking-tight text-ink transition-colors hover:text-accent"
      >
        EtymEx
      </Link>
      <div className="ml-auto flex min-w-0 max-w-64 flex-1 justify-end">
        {searchLanguage && <SearchBox language={searchLanguage} />}
      </div>
      <ThemeToggle />
    </header>
  )
}
