'use client'

import { useId, useRef, type KeyboardEvent } from 'react'
import type { DisplayHistoryChoice } from '@/lib/resultLocalization'

interface EntrySelectorProps {
  word: string
  entries: DisplayHistoryChoice[]
  activeEntryId: string
  onChange: (entryId: string) => void
}

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV']

function metadata(entry: DisplayHistoryChoice): string {
  if (entry.formOf) return `form of ${entry.formOf.word}`
  if (entry.partsOfSpeech.length > 0) return entry.partsOfSpeech.join(' · ')
  return entry.entryKind === 'unresolved' ? 'distinct history' : entry.entryKind
}

export function EntrySelector({ word, entries, activeEntryId, onChange }: EntrySelectorProps) {
  const id = useId()
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  if (entries.length < 2) return null

  function activate(index: number) {
    const entry = entries[index]
    if (!entry) return
    onChange(entry.id)
    buttons.current[index]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % entries.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + entries.length) % entries.length
    } else if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = entries.length - 1
    }
    if (next === null) return
    event.preventDefault()
    activate(next)
  }

  return (
    <div
      className="mt-6 grid border-t border-border-soft sm:grid-cols-2"
      role="tablist"
      aria-label={`Choose an etymology for ${word}`}
    >
      {entries.map((entry, index) => {
        const selected = entry.id === activeEntryId
        const details = metadata(entry)
        return (
          <button
            key={entry.id}
            ref={(element) => {
              buttons.current[index] = element
            }}
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${id}-panel`}
            aria-label={`History ${index + 1} of ${entries.length}, ${details}, ${entry.label}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(entry.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`relative min-h-12 border-b border-border-soft px-4 py-3 text-left transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-amber sm:px-5 sm:py-4 sm:odd:border-r ${
              selected ? 'bg-surface-muted' : 'hover:bg-surface/70'
            }`}
          >
            {selected && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-[3px] bg-accent-amber"
              />
            )}
            <span className="block text-[10px] uppercase tracking-[0.2em] text-charcoal-light/70">
              <span aria-hidden="true" className="font-serif text-xs tracking-normal">
                {ROMAN_NUMERALS[index] ?? index + 1}
              </span>{' '}
              · {details}
            </span>
            <span className="mt-1 block line-clamp-2 font-serif text-base leading-snug text-charcoal sm:text-lg">
              {entry.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
