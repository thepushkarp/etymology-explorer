'use client'

import type { ReactNode } from 'react'
import type { BetaEtymologyResult, BilingualText, DisplayEtymologyResult } from '@/lib/types'
import type { LanguageCode } from '@/lib/languages'
import { localizeResult } from '@/lib/resultLocalization'
import { toPartialResult, type PartialEtymology } from '@/lib/streamReducer'
import { EntryHeader } from './etymology-card/EntryHeader'

interface TraceHeaderProps {
  /** The searched word — known before any section arrives */
  word: string
  sections: PartialEtymology
  language?: LanguageCode
  /** Optional slot rendered beneath the header border (source summary) */
  summary?: ReactNode
}

const EMPTY_BILINGUAL_TEXT: BilingualText = { en: '', local: '' }

function toDisplayPartialResult(
  word: string,
  sections: PartialEtymology,
  language: LanguageCode
): DisplayEtymologyResult {
  const partial = toPartialResult(word, sections)
  if (language === 'en') return partial

  // Beta section payloads carry bilingual prose at runtime, while the shared
  // stream accumulator remains shaped like the English result. Supply paired
  // empty text for required sections that have not arrived yet, then use the
  // same projection as completed results before rendering any prose.
  const betaPartial = {
    ...partial,
    language,
    definition: sections.definition ?? EMPTY_BILINGUAL_TEXT,
    lore: sections.lore ?? EMPTY_BILINGUAL_TEXT,
  } as unknown as BetaEtymologyResult

  return localizeResult(betaPartial, 'local')
}

/**
 * Persistent header spanning both loading phases of the /word live trace.
 *
 * It stays mounted while the body swaps sources → synthesis, so the word title
 * never remounts and cannot jump between layouts. A `HeaderSkeleton` holds the
 * space until `definition` arrives (the third schema key — by then word and
 * pronunciation have closed too), then the real `EntryHeader` promotes in place
 * using the exact same markup as the final card.
 */
export function TraceHeader({ word, sections, language = 'en', summary }: TraceHeaderProps) {
  const headerReady = sections.definition !== undefined

  return (
    <div className="relative">
      {headerReady ? (
        <EntryHeader result={toDisplayPartialResult(word, sections, language)} />
      ) : (
        <HeaderSkeleton word={word} />
      )}
      {summary}
    </div>
  )
}

function ShimmerBar({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse bg-charcoal/8 ${className}`} />
}

function HeaderSkeleton({ word }: { word: string }) {
  return (
    <header className="border-b border-border-soft pb-10">
      <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">entry</p>
      <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
        <h1 className="mt-3 font-serif text-5xl font-semibold tracking-[-0.06em] text-charcoal md:text-7xl">
          {word}
        </h1>
        <ShimmerBar className="h-5 w-28 rounded-full" />
      </div>
      <div className="mt-7 space-y-3">
        <ShimmerBar className="h-6 w-3/4 max-w-xl rounded-full" />
        <ShimmerBar className="h-4 w-1/2 max-w-md rounded-full" />
      </div>
    </header>
  )
}
