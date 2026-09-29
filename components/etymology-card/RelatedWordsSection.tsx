import type { WordSuggestions } from '@/lib/types'
import { WordLink } from '../WordLink'
import { Section } from './Section'

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

const ROWS: Array<{ key: keyof WordSuggestions; label: string }> = [
  { key: 'synonyms', label: 'Synonyms' },
  { key: 'antonyms', label: 'Antonyms' },
  { key: 'homophones', label: 'Homophones' },
  { key: 'easilyConfusedWith', label: 'Confused with' },
  { key: 'seeAlso', label: 'See also' },
]

export function RelatedWordsSection({
  suggestions,
  title,
}: {
  suggestions: WordSuggestions
  title: string
}) {
  const rows = ROWS.filter(({ key }) => suggestions[key]?.length)
  if (rows.length === 0) return null

  return (
    <Section id="entry-related" title={title}>
      <dl className="space-y-3">
        {rows.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1 sm:flex-row sm:gap-6">
            <dt className="w-32 shrink-0 text-sm text-muted">{label}</dt>
            <dd className="font-serif leading-relaxed text-ink">
              {suggestions[key]!.map((raw, index) => {
                const { word, annotation } = parseWordEntry(raw)
                return (
                  <span key={raw}>
                    {index > 0 && ', '}
                    <WordLink word={word} title={annotation} />
                  </span>
                )
              })}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}
