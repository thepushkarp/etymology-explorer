import type { Metadata } from 'next'
import { PageFrame } from '@/components/PageFrame'
import { WordLink } from '@/components/WordLink'

export const metadata: Metadata = {
  title: 'What is Etymology? A Complete Guide to Word Origins',
  description:
    'Etymology is the study of word origins and how meanings evolve over time. Learn about the linguistic roots of English, Proto-Indo-European, and how words change.',
  alternates: {
    canonical: '/learn/what-is-etymology',
  },
  openGraph: {
    title: 'What is Etymology? A Complete Guide to Word Origins',
    description:
      'Etymology is the study of word origins and how meanings evolve over time. Learn about the linguistic roots of English.',
    url: '/learn/what-is-etymology',
  },
}

const WORD_CHANGE_PATTERNS = [
  {
    title: 'Semantic shift',
    description:
      'Meanings broaden, narrow, or reverse. Nice once meant foolish before settling into pleasant.',
  },
  {
    title: 'Borrowing',
    description:
      'English takes freely from its neighbors: algorithm from Arabic, piano from Italian, tsunami from Japanese.',
  },
  {
    title: 'Compounding',
    description:
      'Fresh words arise by joining older ones, from smartphone today to nostril as nose-hole centuries ago.',
  },
  {
    title: 'Back-formation',
    description:
      'Sometimes a newer-looking root gets imagined backward: edit from editor, burgle from burglar.',
  },
]

const ORIGINS = [
  { label: 'Latin', share: 29 },
  { label: 'French', share: 29 },
  { label: 'Germanic', share: 26 },
  { label: 'Greek', share: 6 },
  { label: 'Other', share: 10 },
]

function OriginsTable() {
  return (
    <figure className="my-10">
      <figcaption className="label mb-4">A rough share of English vocabulary</figcaption>
      <ul className="space-y-2">
        {ORIGINS.map((origin) => (
          <li key={origin.label} className="flex items-center gap-4 text-sm">
            <span className="w-20 font-serif text-ink">{origin.label}</span>
            <span className="h-px flex-1 bg-rule">
              <span className="block h-px bg-ink" style={{ width: `${origin.share * 3}%` }} />
            </span>
            <span className="w-10 text-right tabular-nums text-muted">{origin.share}%</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-5 mt-14 font-serif text-2xl text-ink">{children}</h2>
}

export default function WhatIsEtymologyPage() {
  return (
    <PageFrame
      title="What is etymology?"
      subtitle="How words begin, how their meanings move, and why old forms still matter."
    >
      <article className="max-w-2xl space-y-5 font-serif text-lg leading-[1.8] text-ink [&_p]:text-pretty">
        <p>
          <strong className="font-normal">Etymology</strong> is the study of the origin of words and
          the historical development of their meanings. It traces words through time and across
          languages, revealing how sounds, spellings, and meanings have shifted from ancient roots
          to modern usage. The word itself comes from the Greek <em>etymologia</em>, combining{' '}
          <em>etymon</em> (true sense) and <em>logia</em> (study of): &ldquo;the study of the true
          meaning of words.&rdquo;
        </p>
        <p className="text-muted">
          Etymology shows language as a living system, shaped by migration, conquest, trade, and
          cultural exchange over thousands of years.
        </p>

        <Heading>Where English words come from</Heading>
        <p>
          English has roughly 170,000 words in current use, drawn from a remarkably diverse set of
          source languages.
        </p>
        <OriginsTable />
        <p>
          Roughly 58% of English vocabulary has Latin roots, either directly or through French. Yet
          the most frequent everyday words, like <WordLink word="the" />, <WordLink word="be" />,{' '}
          <WordLink word="have" />, and <WordLink word="do" />, remain predominantly Germanic.
        </p>

        <blockquote className="my-10 border-l border-accent pl-6 italic">
          &ldquo;Etymology is the study of words at rest, as it were, without which the study of
          words in motion would be impossible.&rdquo;
          <footer className="mt-2 text-sm not-italic text-muted">
            — <cite>Ernest Weekley (1865–1954)</cite>
          </footer>
        </blockquote>

        <Heading>How words change over time</Heading>
        <p>
          Words shift in meaning, pronunciation, and spelling across generations. Linguists group
          those changes into a few recurring patterns.
        </p>
        <dl className="my-8 space-y-5">
          {WORD_CHANGE_PATTERNS.map((pattern) => (
            <div key={pattern.title}>
              <dt className="italic">{pattern.title}</dt>
              <dd className="text-base text-muted">{pattern.description}</dd>
            </div>
          ))}
        </dl>
        <p>
          A borrowed word can shift in meaning, gain a local spelling, and then seed a new family of
          compounds. That overlap is what makes etymology feel less like a glossary and more like a
          living record.
        </p>

        <Heading>Proto-Indo-European, the common ancestor</Heading>
        <p>
          Proto-Indo-European (PIE) is the reconstructed common ancestor of the Indo-European
          language family, probably spoken around 4500–2500 BCE on the Pontic-Caspian steppe.
          Through its descendants, from English and Spanish to Hindi, Russian, and Persian, it
          connects roughly half of the world&apos;s population.
        </p>
        <p>
          Trace many English words back far enough and you reach a reconstructed PIE root:{' '}
          <WordLink word="mother" /> derives from <em>*méh₂tēr</em>, which also gave Latin{' '}
          <em>māter</em>, Greek <em>mḗtēr</em>, and Sanskrit <em>mātṛ́</em>.
        </p>

        <Heading>Why it matters</Heading>
        <p>
          Knowing a word&apos;s history helps you decode unfamiliar vocabulary, explains irregular
          spellings, and shows how cultures met and borrowed from one another. Try{' '}
          <WordLink word="nice" />, <WordLink word="algorithm" />, or <WordLink word="window" />.
        </p>

        <Heading>Sources</Heading>
        <ul className="space-y-1 text-base text-muted">
          <li>
            <a
              href="https://www.etymonline.com"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Online Etymology Dictionary
            </a>{' '}
            — Douglas Harper
          </li>
          <li>
            <a
              href="https://en.wiktionary.org"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Wiktionary
            </a>
          </li>
          <li>The Oxford Dictionary of English Etymology</li>
        </ul>
      </article>
    </PageFrame>
  )
}
