'use client'

import Link from 'next/link'
import { useState } from 'react'
import { SearchBox } from '@/components/SearchBox'
import { ThemeToggle } from '@/components/ThemeToggle'
import { VersionInfo } from '@/components/VersionInfo'
import {
  LANGUAGES,
  isLanguageCode,
  SUPPORTED_LANGUAGE_CODES,
  type LanguageCode,
} from '@/lib/languages'

interface SiteHeaderProps {
  /** The landing page supplies its own search field. */
  showSearch?: boolean
  searchLanguage?: LanguageCode
}

function HeaderSearch({ initialLanguage }: { initialLanguage?: LanguageCode }) {
  const [language, setLanguage] = useState(initialLanguage)
  return (
    <div className="flex w-full items-center gap-2">
      <SearchBox language={language} />
      <select
        aria-label="Word language"
        value={language ?? ''}
        onChange={(event) =>
          setLanguage(isLanguageCode(event.target.value) ? event.target.value : undefined)
        }
        className="max-w-20 cursor-pointer bg-paper py-2 text-sm text-muted [color-scheme:light] dark:[color-scheme:dark]"
      >
        <option value="">Auto</option>
        {SUPPORTED_LANGUAGE_CODES.map((code) => (
          <option key={code} value={code}>
            {LANGUAGES[code].englishName}
          </option>
        ))}
      </select>
    </div>
  )
}

export function SiteHeader({ showSearch, searchLanguage }: SiteHeaderProps) {
  return (
    <header className="mx-auto grid w-full max-w-3xl grid-cols-[1fr_auto] items-center gap-3 px-4 pt-5 sm:flex sm:gap-6 sm:px-6 sm:pt-7">
      <Link
        href="/"
        className="shrink-0 font-serif text-xl italic tracking-tight text-ink transition-colors hover:text-accent sm:mr-auto"
      >
        EtymEx
      </Link>
      {(showSearch || searchLanguage) && (
        <div className="order-last col-span-2 min-w-0 sm:order-none sm:max-w-72 sm:flex-1">
          <HeaderSearch key={searchLanguage ?? 'auto'} initialLanguage={searchLanguage} />
        </div>
      )}
      <div className="flex shrink-0 items-center gap-4">
        <VersionInfo />
        <ThemeToggle />
      </div>
    </header>
  )
}
