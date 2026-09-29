'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { markTraceIntent } from '@/lib/traceIntent'
import { wordPagePath, type LanguageCode } from '@/lib/languages'

interface WordLinkProps {
  word: string
  language?: LanguageCode
  className?: string
  title?: string
  children?: ReactNode
}

/**
 * A real link to a word page. Clicking it marks trace intent so an uncached
 * page may auto-trace; crawlers following the href never carry that flag.
 * Prefetch is off: each prefetch would render a word page per visible link.
 */
export function WordLink({
  word,
  language = 'en',
  className = 'link',
  title,
  children,
}: WordLinkProps) {
  return (
    <Link
      href={wordPagePath(word, language)}
      prefetch={false}
      onClick={() => markTraceIntent(word, language)}
      className={className}
      title={title}
    >
      {children ?? word}
    </Link>
  )
}
