import type { Metadata } from 'next'
import { PageFrame } from '@/components/PageFrame'
import { WordLink } from '@/components/WordLink'
import {
  BETA_SYMBOL,
  LANGUAGES,
  SUPPORTED_LANGUAGE_CODES,
  type LanguageCode,
} from '@/lib/languages'
import { getTracedWords, type TracedWord } from '@/lib/tracedWords'

// Crawlable A–Z index of every cached word page: the internal-link path to
// traced words beyond the sitemap. Every link targets a cached page, so a
// crawler walking it never reaches the live trace.
export const revalidate = 86400

export const metadata: Metadata = {
  title: 'Index of words',
  description:
    'Every word EtymEx has traced, A to Z. Each entry follows the word back through the languages it passed through, with its sources.',
  alternates: { canonical: '/words' },
  openGraph: {
    title: 'Index of words - EtymEx',
    description: 'Every word EtymEx has traced, A to Z.',
    url: '/words',
  },
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const OTHER_INITIAL = '#'

interface LetterGroup {
  letter: string
  words: string[]
}

/** Initial letter with diacritics folded (é → E), so accented words file under their base letter. */
function initialOf(word: string): string {
  const letter = word.normalize('NFD').charAt(0).toUpperCase()
  return ALPHABET.includes(letter) ? letter : OTHER_INITIAL
}

function groupByInitial(words: string[], language: LanguageCode): LetterGroup[] {
  const sorted = [...words].sort((a, b) => a.localeCompare(b, language, { sensitivity: 'base' }))
  const groups = new Map<string, string[]>()
  for (const word of sorted) {
    const letter = initialOf(word)
    groups.set(letter, [...(groups.get(letter) ?? []), word])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === OTHER_INITIAL ? 1 : b === OTHER_INITIAL ? -1 : a.localeCompare(b)))
    .map(([letter, groupWords]) => ({ letter, words: groupWords }))
}

function wordsByLanguage(traced: TracedWord[]): Array<[LanguageCode, LetterGroup[]]> {
  return SUPPORTED_LANGUAGE_CODES.map((language): [LanguageCode, string[]] => [
    language,
    traced.filter((entry) => entry.language === language).map((entry) => entry.word),
  ])
    .filter(([, words]) => words.length > 0)
    .map(([language, words]) => [language, groupByInitial(words, language)])
}

function anchorFor(language: LanguageCode, letter: string): string {
  return `${language}-${letter === OTHER_INITIAL ? 'other' : letter.toLowerCase()}`
}

export default async function WordsIndexPage() {
  const traced = await getTracedWords()
  const sections = wordsByLanguage(traced)
  const subtitle =
    traced.length > 0
      ? `${traced.length} ${traced.length === 1 ? 'word' : 'words'} traced so far, A to Z.`
      : 'No words have been traced yet.'

  return (
    <PageFrame title="Index" subtitle={subtitle}>
      {sections.map(([language, groups]) => {
        const present = new Set(groups.map((group) => group.letter))
        const definition = LANGUAGES[language]
        return (
          <section
            key={language}
            aria-labelledby={`${language}-heading`}
            className="mb-16 last:mb-0"
          >
            <h2 id={`${language}-heading`} className="label">
              {definition.englishName}
              {definition.beta ? ` ${BETA_SYMBOL}` : ''}
            </h2>
            <nav
              aria-label={`${definition.englishName} letters`}
              className="mt-4 flex flex-wrap gap-x-3 gap-y-1 font-serif text-muted"
            >
              {ALPHABET.map((letter) =>
                present.has(letter) ? (
                  <a
                    key={letter}
                    href={`#${anchorFor(language, letter)}`}
                    className="transition-colors hover:text-accent"
                  >
                    {letter}
                  </a>
                ) : (
                  <span key={letter} className="text-faint" aria-hidden>
                    {letter}
                  </span>
                )
              )}
            </nav>
            <div className="mt-6 border-t border-rule">
              {groups.map(({ letter, words }) => (
                <div
                  key={letter}
                  id={anchorFor(language, letter)}
                  className="grid scroll-mt-6 grid-cols-[2.5rem_1fr] items-baseline gap-4 border-b border-rule py-5"
                >
                  <h3 className="font-serif text-2xl italic text-accent">{letter}</h3>
                  <ul className="flex flex-wrap gap-x-5 gap-y-2">
                    {words.map((word) => (
                      <li key={word}>
                        <WordLink
                          word={word}
                          language={language}
                          className="font-serif text-lg text-ink transition-colors hover:text-accent"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </PageFrame>
  )
}
