'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
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
 * Prefetch starts on hover or keyboard focus. A page full of word links must
 * not render every destination just because its links enter the viewport.
 */
export function WordLink({
  word,
  language = 'en',
  className = 'link',
  title,
  children,
}: WordLinkProps) {
  const [prefetch, setPrefetch] = useState(false)

  return (
    <Link
      href={wordPagePath(word, language)}
      prefetch={prefetch}
      onMouseEnter={() => setPrefetch(true)}
      onFocus={() => setPrefetch(true)}
      onClick={() => markTraceIntent(word, language)}
      className={className}
      title={title}
    >
      {children ?? word}
    </Link>
  )
}
