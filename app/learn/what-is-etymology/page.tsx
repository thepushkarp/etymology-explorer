import type { Metadata } from 'next'
import Link from 'next/link'
import { EditorialPageFrame } from '@/components/EditorialPageFrame'

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

const CONTENTS = [
  { id: 'meaning', label: 'What etymology means' },
  { id: 'origins', label: 'Where English words come from' },
  { id: 'change', label: 'How words change' },
  { id: 'pie', label: 'Proto-Indo-European' },
  { id: 'matter', label: 'Why it matters' },
  { id: 'sources', label: 'Sources' },
]

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

function OriginsBar() {
  const origins = [
    { label: 'Latin', share: 29, color: 'var(--accent-oxblood)' },
    { label: 'French', share: 29, color: 'var(--accent-soft)' },
    { label: 'Germanic', share: 26, color: 'var(--accent-olive)' },
    { label: 'Greek', share: 6, color: 'var(--accent-sky)' },
    { label: 'Other', share: 10, color: 'var(--accent-plum)' },
  ]

  return (
    <div className="editorial-panel mt-8 p-6">
      <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
        a rough share of english vocabulary
      </p>
      <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-surface-muted">
        {origins.map((origin) => (
          <div
            key={origin.label}
            className="h-full"
            style={{ width: `${origin.share}%`, backgroundColor: origin.color }}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {origins.map((origin) => (
          <div key={origin.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 font-serif text-charcoal">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: origin.color }}
              />
              {origin.label}
            </span>
            <span className="text-charcoal-light">{origin.share}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionHeading({ id, number, title }: { id: string; number: string; title: string }) {
  return (
    <div id={id} className="scroll-mt-24 border-t border-border-soft pt-8">
      <p className="font-serif text-lg italic text-charcoal-light/72">{number}</p>
      <h2 className="mt-1 font-serif text-3xl tracking-[-0.03em] text-charcoal sm:text-[2.35rem]">
        {title}
      </h2>
    </div>
  )
}

export default function WhatIsEtymologyPage() {
  return (
    <EditorialPageFrame
      eyebrow="essay · 8 min read"
      title="What is Etymology?"
      subtitle="A complete guide to word origins, how meanings move, and why old forms still matter."
    >
      <article className="grid gap-10 xl:grid-cols-[190px_minmax(0,680px)_260px]">
        <nav className="editorial-panel h-fit p-5 xl:sticky xl:top-24">
          <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">contents</p>
          <ol className="mt-4 space-y-3 text-sm text-charcoal-light">
            {CONTENTS.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="transition-colors hover:text-charcoal">
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="max-w-[680px]">
          <section id="meaning" className="mb-12">
            <p className="editorial-dropcap font-serif text-[1.14rem] leading-relaxed text-charcoal sm:text-[1.22rem]">
              <strong>Etymology</strong> is the study of the origin of words and the historical
              development of their meanings. It traces words through time and across languages,
              revealing how sounds, spellings, and meanings have shifted from ancient roots to
              modern usage. The word &ldquo;etymology&rdquo; itself comes from the Greek{' '}
              <em>etymologia</em>, combining <em>etymon</em> (true sense) and <em>logia</em> (study
              of), literally meaning &ldquo;the study of the true meaning of words.&rdquo;
            </p>
            <p className="mt-6 font-serif text-[1.08rem] leading-relaxed text-charcoal-light">
              Understanding etymology helps us see language not as a static system but as a living,
              evolving organism shaped by migration, conquest, trade, and cultural exchange over
              thousands of years.
            </p>
          </section>

          <section className="mb-12">
            <SectionHeading id="origins" number="01" title="Where English words come from" />
            <p className="mt-5 font-serif text-[1.08rem] leading-relaxed text-charcoal-light">
              The English language contains approximately 170,000 words in current use, drawing from
              a remarkably diverse set of source languages.
            </p>
            <OriginsBar />
            <p className="mt-6 font-serif text-[1.08rem] leading-relaxed text-charcoal-light">
              Roughly 58% of English vocabulary has Latin roots, either directly or through French.
              Yet the most frequently used words in everyday speech, like{' '}
              <Link
                href="/?q=the"
                className="underline decoration-border-strong underline-offset-4"
              >
                the
              </Link>
              ,{' '}
              <Link href="/?q=be" className="underline decoration-border-strong underline-offset-4">
                be
              </Link>
              ,{' '}
              <Link
                href="/?q=have"
                className="underline decoration-border-strong underline-offset-4"
              >
                have
              </Link>
              , and{' '}
              <Link href="/?q=do" className="underline decoration-border-strong underline-offset-4">
                do
              </Link>{' '}
              remain predominantly Germanic.
            </p>
          </section>

          <section className="editorial-panel mb-12 px-6 py-6">
            <blockquote className="border-l-2 border-[var(--accent-oxblood)] py-2 pl-6 font-serif text-lg italic text-charcoal">
              &ldquo;Etymology is the study of words at rest, as it were, without which the study of
              words in motion would be impossible.&rdquo;
            </blockquote>
            <p className="mt-2 pl-6 font-serif text-sm text-charcoal-light">
              — <cite>Ernest Weekley, British philologist and etymologist (1865–1954)</cite>
            </p>
          </section>

          <section className="mb-12">
            <SectionHeading id="change" number="02" title="How words change over time" />
            <p className="mt-5 font-serif text-[1.08rem] leading-relaxed text-charcoal-light">
              Words are not fixed entities. They shift in meaning, pronunciation, and spelling
              across generations. Linguists often group those changes into a few recurring patterns.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {WORD_CHANGE_PATTERNS.map((pattern) => (
                <article key={pattern.title} className="editorial-panel p-5">
                  <h3 className="font-serif text-[1.55rem] tracking-[-0.02em] text-charcoal">
                    {pattern.title}
                  </h3>
                  <p className="mt-3 font-serif italic leading-relaxed text-charcoal-light">
                    {pattern.description}
                  </p>
                </article>
              ))}
            </div>
            <p className="mt-6 font-serif text-[1.08rem] leading-relaxed text-charcoal-light">
              A borrowed word can shift in meaning, gain a local spelling, and then seed a new
              family of compounds inside English. That overlap is what makes etymology feel less
              like a glossary and more like a living record.
            </p>
          </section>

          <section className="mb-12">
            <SectionHeading id="pie" number="03" title="Proto-Indo-European, the common ancestor" />
            <p className="mt-5 font-serif text-[1.08rem] leading-relaxed text-charcoal-light">
              Proto-Indo-European (PIE) is the reconstructed common ancestor of the Indo-European
              language family, believed to have been spoken approximately 4500–2500 BCE, likely in
              the Pontic-Caspian steppe region of Eastern Europe.
            </p>
            <p className="mt-4 font-serif text-[1.08rem] leading-relaxed text-charcoal-light">
              PIE connects roughly half of the world&apos;s population through languages as diverse
              as English, German, Spanish, Hindi, Russian, Greek, and Persian.
            </p>
            <p className="mt-4 font-serif text-[1.08rem] leading-relaxed text-charcoal-light">
              When you trace many English words back far enough, you reach reconstructed PIE roots.
              For example,{' '}
              <Link
                href="/?q=mother"
                className="underline decoration-border-strong underline-offset-4"
              >
                mother
              </Link>{' '}
              derives from PIE <em>*méh₂tēr</em>, which also gave rise to Latin <em>māter</em>,
              Greek <em>mḗtēr</em>, and Sanskrit <em>mātṛ́</em>.
            </p>
          </section>

          <section className="mb-12">
            <SectionHeading id="matter" number="04" title="Why etymology matters" />
            <ul className="mt-5 ml-6 list-disc space-y-2 font-serif text-[1.08rem] leading-relaxed text-charcoal-light">
              <li>
                <strong>Vocabulary expansion</strong> by helping you decode unfamiliar words
              </li>
              <li>
                <strong>Spelling improvement</strong> by explaining irregular forms
              </li>
              <li>
                <strong>Cultural literacy</strong> through the historical contact between languages
              </li>
              <li>
                <strong>Critical thinking</strong> by showing how meaning shifts over time
              </li>
            </ul>

            <div className="editorial-panel mt-8 p-6">
              <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
                try a word from this essay
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {['nice', 'algorithm', 'mother', 'window'].map((word) => (
                  <Link
                    key={word}
                    href={`/?q=${encodeURIComponent(word)}`}
                    className="rounded-full border border-border-soft px-4 py-2 font-serif italic text-charcoal-light transition-colors hover:border-border-strong hover:text-charcoal"
                  >
                    {word}
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <section id="sources">
            <SectionHeading id="sources-heading" number="05" title="Sources" />
            <ul className="mt-5 space-y-2 font-serif text-sm leading-relaxed text-charcoal-light">
              <li>
                <a
                  href="https://www.etymonline.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-border-strong underline-offset-4"
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
                  className="underline decoration-border-strong underline-offset-4"
                >
                  Wiktionary
                </a>
              </li>
              <li>The Oxford Dictionary of English Etymology</li>
            </ul>
          </section>
        </div>

        <aside className="hidden xl:block">
          <div className="editorial-panel sticky top-24 p-6">
            <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
              marginalia
            </p>
            <p className="mt-4 font-serif text-[1.6rem] tracking-[-0.03em] text-charcoal">
              Start with an ordinary word. The older life is usually stranger than the modern one.
            </p>
            <p className="mt-4 font-serif italic leading-relaxed text-charcoal-light">
              The ancestry map in the explorer is best read top to bottom: reconstructed forms,
              borrowings, convergences, and the modern arrival.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center text-sm uppercase tracking-[0.18em] text-charcoal-light transition-colors hover:text-charcoal"
            >
              Back to explorer
            </Link>
          </div>
        </aside>
      </article>
    </EditorialPageFrame>
  )
}
