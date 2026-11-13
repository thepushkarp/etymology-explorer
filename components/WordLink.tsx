'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { markTraceIntent } from '@/lib/traceIntent'
import type { LanguageCode } from '@/lib/languages'
import { recordRecentSearchIntent } from '@/lib/recentSearchClient'
import { entryPagePath } from '@/lib/entrySelection'
import { navigateEntry } from '@/lib/hooks/useEntrySelection'

interface WordLinkProps {
  word: string
  language?: LanguageCode
  historyId?: string
  lookup?: string
  localNavigation?: boolean
  /** Language of a custom label when it differs from the destination entry. */
  lang?: LanguageCode
  className?: string
  title?: string
  'aria-current'?: 'page'
  children?: ReactNode
}

/**
 * A real link to a word page. Clicking it marks trace intent so an uncached
 * page may auto-trace; crawlers following the href never carry that flag.
 * Prefetch starts on hover or keyboard focus. A page full of word links must
 * not render every destination just because its links enter the viewport.
 */
export function WordLink({
  word,
  language,
  historyId,
  lookup,
  localNavigation = false,
  lang = language,
  className = 'link',
  title,
  children,
  'aria-current': ariaCurrent,
}: WordLinkProps) {
  const [prefetch, setPrefetch] = useState(false)
  const href = entryPagePath(word, language, { historyId, lookup })

  return (
    <Link
      href={href}
      scroll={!localNavigation}
      prefetch={localNavigation ? false : prefetch}
      onMouseEnter={() => setPrefetch(true)}
      onFocus={() => setPrefetch(true)}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
          return
        if (localNavigation) {
          event.preventDefault()
          navigateEntry(href)
          return
        }
        markTraceIntent(word, language)
        void recordRecentSearchIntent(word)
      }}
      className={className}
      title={title}
      aria-current={ariaCurrent}
      lang={lang}
      dir="auto"
    >
      {children ?? word}
    </Link>
  )
}
