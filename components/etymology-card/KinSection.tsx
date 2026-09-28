import type { Root } from '@/lib/types'
import { WordLink } from '../WordLink'
import { Section } from './Section'

/** Forms tagged with a language, written in another script, or reconstructed are cognates. */
function isCognate(word: string): boolean {
  return /\([A-Z][a-z]+\)/.test(word) || /[^\x00-\x7F]/.test(word) || /^\*|Proto-|PIE/.test(word)
}

interface KinSectionProps {
  roots: Root[]
  /** Related terms are only language-tagged for English; beta kin stays plain text. */
  linkable: boolean
  title: string
}

export function KinSection({ roots, linkable, title }: KinSectionProps) {
  const withWords = roots.filter((root) => root.relatedWords.length > 0)
  if (withWords.length === 0) return null

  return (
    <Section id="entry-kin" title={title}>
      <div className="grid gap-10 sm:grid-cols-2">
        {withWords.map((root, index) => {
          const cognates = root.relatedWords.filter(isCognate)
          const derived = root.relatedWords.filter((word) => !isCognate(word))
          return (
            <div key={`${root.root}-${index}`}>
              <p className="font-serif text-ink">
                <em>{root.root}</em>{' '}
                <span className="text-muted">
                  · {root.origin}, &lsquo;{root.meaning}&rsquo;
                </span>
              </p>
              <WordList label="Derived" words={derived} linkable={linkable} />
              <WordList label="Cognates" words={cognates} linkable={false} />
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function WordList({
  label,
  words,
  linkable,
}: {
  label: string
  words: string[]
  linkable: boolean
}) {
  if (words.length === 0) return null
  return (
    <p className="mt-3 font-serif leading-relaxed text-ink">
      <span className="mr-2 text-sm text-muted">{label}</span>
      {words.map((word, index) => (
        <span key={`${word}-${index}`}>
          {index > 0 && ', '}
          {linkable ? <WordLink word={word} /> : <span>{word}</span>}
        </span>
      ))}
    </p>
  )
}
