'use client'

import { useRef, type KeyboardEvent } from 'react'
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

/** Tabs for words with several unrelated etymologies (homographs). */
export function EntrySelector({ word, entries, activeEntryId, onChange }: EntrySelectorProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  if (entries.length < 2) return null

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: entries.length - 1,
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    const next = (moves[event.key] + entries.length) % entries.length
    onChange(entries[next].id)
    buttons.current[next]?.focus()
  }

  return (
    <div
      className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-b border-rule"
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
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={`History ${index + 1} of ${entries.length}, ${details}, ${entry.label}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(entry.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`-mb-px max-w-60 border-b pb-3 text-left transition-colors ${
              selected ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <span className="label block">
              {ROMAN_NUMERALS[index] ?? index + 1} · {details}
            </span>
            <span className="mt-1 line-clamp-1 block font-serif">{entry.label}</span>
          </button>
        )
      })}
    </div>
  )
}
