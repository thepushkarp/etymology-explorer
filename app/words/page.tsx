import type { Metadata } from 'next'
import { PageFrame } from '@/components/PageFrame'
import { WordLink } from '@/components/WordLink'
import { detectScripts } from '@/lib/languages'
import { getTracedWords } from '@/lib/tracedWords'

// This cache-only index provides an internal link to every corpus word.
export const revalidate = 86400

export const metadata: Metadata = {
  title: 'Index of words',
  description:
    'Every word EtymEx has traced, grouped by initial or script. Each entry follows the word back through the languages it passed through, with its sources.',
  alternates: { canonical: '/words' },
  openGraph: {
    title: 'Index of words - EtymEx',
    description: 'Every word EtymEx has traced, grouped by initial or script.',
    url: '/words',
  },
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const OTHER_INITIAL = '#'

/** Latin diacritics fold into A–Z; other scripts retain their names. */
function groupOf(word: string): string {
  const scripts = detectScripts(word)
  if (scripts.some((script) => script !== 'Latin')) return scripts.join(' / ')
  const initial = word.normalize('NFD').charAt(0).toUpperCase()
  return ALPHABET.includes(initial) ? initial : OTHER_INITIAL
}

function anchorFor(group: string): string {
  return group === OTHER_INITIAL ? 'other' : group.toLowerCase().replace(/\W+/g, '-')
}

export default async function WordsIndexPage() {
  const traced = await getTracedWords()
  const groups = new Map<string, string[]>()
  for (const { word } of [...traced].sort((a, b) =>
    a.word.localeCompare(b.word, 'en', { sensitivity: 'base' })
  )) {
    const group = groupOf(word)
    const words = groups.get(group) ?? []
    words.push(word)
    groups.set(group, words)
  }
  const groupNames = [...groups.keys()].sort((a, b) => {
    const rank = (group: string) => (ALPHABET.includes(group) ? 0 : group === OTHER_INITIAL ? 2 : 1)
    return rank(a) - rank(b) || a.localeCompare(b)
  })
  const navigation = [...ALPHABET, ...groupNames.filter((group) => !ALPHABET.includes(group))]
  const subtitle =
    traced.length > 0
      ? `${traced.length} ${traced.length === 1 ? 'word' : 'words'} traced so far.`
      : 'No words have been traced yet.'

  return (
    <PageFrame title="Index" subtitle={subtitle}>
      {traced.length > 0 && (
        <nav
          aria-label="Word index"
          className="flex flex-wrap gap-x-3 gap-y-1 font-serif text-muted"
        >
          {navigation.map((group) =>
            groups.has(group) ? (
              <a
                key={group}
                href={`#${anchorFor(group)}`}
                className="transition-colors hover:text-accent"
              >
                {group}
              </a>
            ) : (
              <span key={group} className="text-faint" aria-hidden>
                {group}
              </span>
            )
          )}
        </nav>
      )}
      <div className="mt-6 border-t border-rule">
        {groupNames.map((group) => (
          <section
            key={group}
            id={anchorFor(group)}
            aria-labelledby={`${anchorFor(group)}-heading`}
            className="scroll-mt-6 border-b border-rule py-5"
          >
            <h2
              id={`${anchorFor(group)}-heading`}
              className="font-serif text-2xl italic text-accent"
            >
              {group}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {groups.get(group)?.map((word) => (
                <li key={word}>
                  <WordLink
                    word={word}
                    className="font-serif text-lg text-ink transition-colors hover:text-accent"
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PageFrame>
  )
}
