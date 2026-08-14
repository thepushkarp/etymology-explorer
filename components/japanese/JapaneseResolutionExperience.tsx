'use client'

import { useCallback } from 'react'
import '@fontsource/shippori-mincho/japanese-500.css'
import { useRouter } from 'next/navigation'
import { japaneseEntryPath } from '@/lib/languages'
import { markTraceIntent } from '@/lib/traceIntent'
import type { LexemeCandidate } from '@/lib/types'

export function JapaneseResolutionExperience({
  query,
  candidates,
}: {
  query: string
  candidates: LexemeCandidate[]
}) {
  const router = useRouter()
  const choose = useCallback(
    (candidate: LexemeCandidate) => {
      markTraceIntent(candidate.lemma, 'ja', candidate.entryId)
      const context = new URLSearchParams({ from: query, form: candidate.matchExplanation })
      router.push(`${japaneseEntryPath(candidate.lemma, candidate.entryId)}?${context}`)
    },
    [query, router]
  )

  return (
    <section className="mx-auto max-w-4xl">
      <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/66">
        Japanese entry · β
      </p>
      <h1 className="mt-3 font-japanese text-[clamp(3rem,13vw,5.8rem)] leading-none text-charcoal">
        {query}
      </h1>
      <p className="mt-5 max-w-2xl font-serif text-xl italic leading-relaxed text-charcoal-light">
        This reading belongs to more than one word. Choose the meaning you want before EtymEx spends
        anything tracing its history.
      </p>
      <div className="editorial-double-rule mt-8" />

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {candidates.map((candidate) => (
          <button
            key={candidate.entryId}
            type="button"
            onClick={() => choose(candidate)}
            className="group rounded-[1rem] border border-border-soft bg-surface p-5 text-left transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal"
          >
            <span className="flex items-start justify-between gap-4">
              <span>
                <span className="block font-japanese text-3xl text-charcoal">
                  {candidate.lemma}
                </span>
                <span className="mt-1 block font-japanese text-base text-reading-indigo">
                  {candidate.reading}
                  <span className="ml-2 font-sans text-xs text-charcoal-light">
                    {candidate.romaji}
                  </span>
                </span>
              </span>
              <span aria-hidden="true" className="text-charcoal-light group-hover:text-charcoal">
                →
              </span>
            </span>
            <span className="mt-4 block font-serif text-lg text-charcoal">{candidate.gloss}</span>
            <span className="mt-2 block text-[10px] uppercase tracking-[0.16em] text-charcoal-light">
              {candidate.partOfSpeech.join(' · ') || 'lexical entry'}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
