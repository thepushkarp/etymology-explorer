'use client'

import { WordSuggestions } from '@/lib/types'
import { MobileSection, SECTION_DIVIDER_CLASS, SECTION_TITLE_CLASS } from './MobileSection'

interface RelatedWordsSectionProps {
  suggestions: WordSuggestions
  onWordClick: (word: string) => void
}

/**
 * Extract just the word from an LLM suggestion string.
 * Handles various LLM output patterns:
 *   "endure (to tolerate)" → { word: "endure", annotation: "to tolerate" }
 *   "ensure (to make certain)—inure means..." → { word: "ensure", annotation: "to make certain" }
 *   "habituate, meaning to accustom" → { word: "habituate" }
 *   "ad hoc" → { word: "ad hoc" }
 */
function parseWordEntry(raw: string): { word: string; annotation?: string } {
  let text = raw.trim()

  // 1. If there's a parenthetical, extract word before it and annotation inside
  const parenMatch = text.match(/^([^(]+?)\s*\(([^)]+)\)/)
  if (parenMatch) {
    return { word: parenMatch[1].trim(), annotation: parenMatch[2].trim() }
  }

  // 2. Split on em-dash, en-dash, or " - " and take the first part
  const dashParts = text.split(/\s*[—–]\s*|\s+-\s+/)
  if (dashParts.length > 1) {
    text = dashParts[0]
  }

  // 3. Split on comma followed by description-like text (not another word)
  //    "habituate, meaning to accustom" → "habituate"
  //    but "ice cream, gelato" should keep "ice cream"
  const commaMatch = text.match(/^([^,]+),\s*(meaning|i\.e\.|which|to\b|that\b)/i)
  if (commaMatch) {
    text = commaMatch[1]
  }

  // 4. Split on colon followed by description
  const colonMatch = text.match(/^([^:]+):\s*.{5,}/)
  if (colonMatch) {
    text = colonMatch[1]
  }

  // 5. If the result is unreasonably long (>40 chars), it's probably a sentence —
  //    take just the first word-like chunk
  text = text.trim()
  if (text.length > 40) {
    const firstWord = text.match(/^[\wÀ-ɏ]+(?:[\s-][\wÀ-ɏ]+)?/)
    if (firstWord) {
      text = firstWord[0]
    }
  }

  // 6. Strip trailing punctuation
  text = text.replace(/[.,;:!?]+$/, '').trim()

  return { word: text || raw.trim() }
}

function SuggestionRow({
  label,
  words,
  onWordClick,
  color,
}: {
  label: string
  words: string[]
  onWordClick: (word: string) => void
  color: 'olive' | 'rose' | 'amber' | 'sky' | 'plum'
}) {
  const colorClasses = {
    olive:
      'border-accent-olive/40 bg-surface text-charcoal-light hover:bg-surface-muted hover:border-accent-olive/70',
    rose: 'border-accent-rose/40 bg-surface text-charcoal-light hover:bg-surface-muted hover:border-accent-rose/70',
    amber:
      'border-accent-amber/40 bg-surface text-charcoal-light hover:bg-surface-muted hover:border-accent-amber/70',
    sky: 'border-accent-sky/40 bg-surface text-charcoal-light hover:bg-surface-muted hover:border-accent-sky/70',
    plum: 'border-accent-plum/40 bg-surface text-charcoal-light hover:bg-surface-muted hover:border-accent-plum/70',
  }

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
      <span className="w-full text-xs uppercase tracking-[0.16em] text-charcoal/42 sm:w-32 sm:shrink-0">
        {label}
      </span>
      {words.map((raw) => {
        const { word, annotation } = parseWordEntry(raw)
        return (
          <button
            key={raw}
            onClick={() => onWordClick(word)}
            title={annotation}
            className={`
              cursor-pointer rounded-full border px-2.5 py-1 text-sm font-serif
              transition-colors
              ${colorClasses[color]}
            `}
          >
            {word}
          </button>
        )
      })}
    </div>
  )
}

export function RelatedWordsSection({ suggestions, onWordClick }: RelatedWordsSectionProps) {
  return (
    <MobileSection
      id="entry-related"
      title="Related Words"
      titleTextClassName={SECTION_TITLE_CLASS}
      dividerClassName={SECTION_DIVIDER_CLASS}
    >
      <div className="editorial-card p-4 sm:p-5">
        <div className="space-y-4">
          {suggestions.synonyms && suggestions.synonyms.length > 0 && (
            <SuggestionRow
              label="Synonyms"
              words={suggestions.synonyms}
              onWordClick={onWordClick}
              color="olive"
            />
          )}
          {suggestions.antonyms && suggestions.antonyms.length > 0 && (
            <SuggestionRow
              label="Antonyms"
              words={suggestions.antonyms}
              onWordClick={onWordClick}
              color="rose"
            />
          )}
          {suggestions.homophones && suggestions.homophones.length > 0 && (
            <SuggestionRow
              label="Homophones"
              words={suggestions.homophones}
              onWordClick={onWordClick}
              color="amber"
            />
          )}
          {suggestions.easilyConfusedWith && suggestions.easilyConfusedWith.length > 0 && (
            <SuggestionRow
              label="Often Confused With"
              words={suggestions.easilyConfusedWith}
              onWordClick={onWordClick}
              color="sky"
            />
          )}
          {suggestions.seeAlso && suggestions.seeAlso.length > 0 && (
            <SuggestionRow
              label="See Also"
              words={suggestions.seeAlso}
              onWordClick={onWordClick}
              color="plum"
            />
          )}
        </div>
      </div>
    </MobileSection>
  )
}
