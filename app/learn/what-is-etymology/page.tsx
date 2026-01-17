import type { Metadata } from 'next'
import Link from 'next/link'

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

export default function WhatIsEtymologyPage() {
  return (
    <main className="min-h-screen bg-cream py-12 md:py-20 px-4">
      <article className="max-w-2xl mx-auto">
        {/* Back link */}
        <Link
          href="/"
          className="
            inline-flex items-center gap-2
            text-sm font-serif text-charcoal-light
            hover:text-charcoal
            transition-colors
            mb-8
          "
        >
          &larr; Back to Explorer
        </Link>

        {/* Header */}
        <header className="mb-12">
          <h1
            className="
              font-serif text-3xl md:text-4xl
              text-charcoal
              mb-4
              tracking-tight
              leading-tight
            "
          >
            What is Etymology?
            <span className="block text-xl md:text-2xl text-charcoal-light mt-2 font-normal">
              A Complete Guide to Word Origins
            </span>
          </h1>
        </header>

        {/* Introduction with definition - AI citation optimized first paragraph */}
        <section className="mb-10">
          <p className="font-serif text-lg text-charcoal leading-relaxed mb-4">
            <strong>Etymology</strong> is the study of the origin of words and the historical
            development of their meanings. It traces words through time and across languages,
            revealing how sounds, spellings, and meanings have shifted from ancient roots to modern
            usage. The word &ldquo;etymology&rdquo; itself comes from the Greek <em>etymologia</em>,
            combining <em>etymon</em> (true sense) and <em>logia</em> (study of)—literally meaning
            &ldquo;the study of the true meaning of words.&rdquo;
          </p>
          <p className="font-serif text-base text-charcoal-light leading-relaxed">
            Understanding etymology helps us see language not as a static system but as a living,
            evolving organism shaped by migration, conquest, trade, and cultural exchange over
            thousands of years.
          </p>
        </section>

        {/* Origins of English Words - Statistics section */}
        <section className="mb-10">
          <h2
            className="
              font-serif text-2xl text-charcoal
              mb-4 pb-2
              border-b border-charcoal/10
            "
          >
            The Origins of English Words
          </h2>
          <p className="font-serif text-base text-charcoal-light leading-relaxed mb-4">
            The English language contains approximately 170,000 words in current use, drawing from a
            remarkably diverse set of source languages. According to linguistic research:
          </p>
          <ul className="font-serif text-base text-charcoal-light leading-relaxed space-y-2 ml-6 list-disc mb-4">
            <li>
              <strong>29% from Latin</strong> — primarily through scholarly, legal, and religious
              texts
            </li>
            <li>
              <strong>29% from French</strong> — largely from the Norman Conquest of 1066
            </li>
            <li>
              <strong>26% from Germanic languages</strong> — the original Anglo-Saxon foundation
            </li>
            <li>
              <strong>6% from Greek</strong> — especially scientific and philosophical terms
            </li>
            <li>
              <strong>10% from other languages</strong> — including Arabic, Hindi, Japanese, and
              hundreds more
            </li>
          </ul>
          <p className="font-serif text-base text-charcoal-light leading-relaxed">
            This means that roughly 58% of English vocabulary has Latin roots, either directly or
            through French. Yet the most frequently used words in everyday speech—
            <Link href="/?q=the" className="text-charcoal underline hover:text-charcoal-light">
              the
            </Link>
            ,{' '}
            <Link href="/?q=be" className="text-charcoal underline hover:text-charcoal-light">
              be
            </Link>
            ,{' '}
            <Link href="/?q=have" className="text-charcoal underline hover:text-charcoal-light">
              have
            </Link>
            ,{' '}
            <Link href="/?q=do" className="text-charcoal underline hover:text-charcoal-light">
              do
            </Link>
            —remain predominantly Germanic.
          </p>
        </section>

        {/* Expert quote */}
        <section className="mb-10">
          <blockquote
            className="
              border-l-4 border-charcoal/20
              pl-6 py-2
              font-serif italic text-charcoal
              text-lg
            "
          >
            &ldquo;Etymology is the study of words at rest, as it were, without which the study of
            words in motion would be impossible.&rdquo;
          </blockquote>
          <p className="font-serif text-sm text-charcoal-light mt-2 pl-6">
            — <cite>Ernest Weekley, British philologist and etymologist (1865–1954)</cite>
          </p>
        </section>

        {/* How Words Change Over Time */}
        <section className="mb-10">
          <h2
            className="
              font-serif text-2xl text-charcoal
              mb-4 pb-2
              border-b border-charcoal/10
            "
          >
            How Words Change Over Time
          </h2>
          <p className="font-serif text-base text-charcoal-light leading-relaxed mb-4">
            Words are not fixed entities—they shift in meaning, pronunciation, and spelling across
            generations. Linguists have identified several primary mechanisms of change:
          </p>

          <h3 className="font-serif text-lg text-charcoal mb-2 mt-6">1. Semantic Shift</h3>
          <p className="font-serif text-base text-charcoal-light leading-relaxed mb-4">
            Words can broaden, narrow, or completely reverse their meanings. The word{' '}
            <Link href="/?q=nice" className="text-charcoal underline hover:text-charcoal-light">
              nice
            </Link>{' '}
            originally meant &ldquo;ignorant&rdquo; or &ldquo;foolish&rdquo; in Latin (
            <em>nescius</em>). Over centuries, it evolved through &ldquo;precise&rdquo; and
            &ldquo;particular&rdquo; to its modern meaning of &ldquo;pleasant.&rdquo;
          </p>

          <h3 className="font-serif text-lg text-charcoal mb-2 mt-6">2. Borrowing</h3>
          <p className="font-serif text-base text-charcoal-light leading-relaxed mb-4">
            Languages constantly borrow words from each other. English has adopted{' '}
            <Link
              href="/?q=algorithm"
              className="text-charcoal underline hover:text-charcoal-light"
            >
              algorithm
            </Link>{' '}
            from Arabic (after mathematician al-Khwarizmi),{' '}
            <Link href="/?q=piano" className="text-charcoal underline hover:text-charcoal-light">
              piano
            </Link>{' '}
            from Italian, and{' '}
            <Link href="/?q=tsunami" className="text-charcoal underline hover:text-charcoal-light">
              tsunami
            </Link>{' '}
            from Japanese.
          </p>

          <h3 className="font-serif text-lg text-charcoal mb-2 mt-6">3. Compounding</h3>
          <p className="font-serif text-base text-charcoal-light leading-relaxed mb-4">
            New words form by combining existing ones. Modern examples include <em>smartphone</em>,{' '}
            <em>livestream</em>, and <em>cryptocurrency</em>. This process has ancient roots—the
            word{' '}
            <Link href="/?q=nostril" className="text-charcoal underline hover:text-charcoal-light">
              nostril
            </Link>{' '}
            comes from Old English <em>nosþyrl</em> (&ldquo;nose-hole&rdquo;).
          </p>

          <h3 className="font-serif text-lg text-charcoal mb-2 mt-6">4. Back-formation</h3>
          <p className="font-serif text-base text-charcoal-light leading-relaxed">
            Sometimes words are created by removing what appears to be a suffix. The verb{' '}
            <Link href="/?q=edit" className="text-charcoal underline hover:text-charcoal-light">
              edit
            </Link>{' '}
            was derived from <em>editor</em> (not the other way around), and <em>burgle</em> came
            from <em>burglar</em>.
          </p>
        </section>

        {/* Proto-Indo-European */}
        <section className="mb-10">
          <h2
            className="
              font-serif text-2xl text-charcoal
              mb-4 pb-2
              border-b border-charcoal/10
            "
          >
            Proto-Indo-European: The Common Ancestor
          </h2>
          <p className="font-serif text-base text-charcoal-light leading-relaxed mb-4">
            Proto-Indo-European (PIE) is the reconstructed common ancestor of the Indo-European
            language family, believed to have been spoken approximately 4500–2500 BCE, likely in the
            Pontic-Caspian steppe region of Eastern Europe.
          </p>
          <p className="font-serif text-base text-charcoal-light leading-relaxed mb-4">
            PIE is the linguistic root connecting roughly half of the world&apos;s population
            through languages as diverse as:
          </p>
          <ul className="font-serif text-base text-charcoal-light leading-relaxed space-y-1 ml-6 list-disc mb-4">
            <li>English, German, Dutch (Germanic branch)</li>
            <li>Spanish, French, Italian, Portuguese (Romance branch)</li>
            <li>Hindi, Urdu, Bengali (Indo-Aryan branch)</li>
            <li>Russian, Polish, Czech (Slavic branch)</li>
            <li>Greek (Hellenic branch)</li>
            <li>Persian, Kurdish (Iranian branch)</li>
          </ul>
          <p className="font-serif text-base text-charcoal-light leading-relaxed">
            When you trace many English words back far enough, you reach reconstructed PIE roots.
            For example, the English word{' '}
            <Link href="/?q=mother" className="text-charcoal underline hover:text-charcoal-light">
              mother
            </Link>{' '}
            derives from PIE <em>*méh₂tēr</em>, which also gave rise to Latin <em>māter</em>, Greek{' '}
            <em>mḗtēr</em>, and Sanskrit <em>mātṛ́</em>—all meaning the same thing across thousands
            of miles and millennia.
          </p>
        </section>

        {/* Why Etymology Matters */}
        <section className="mb-10">
          <h2
            className="
              font-serif text-2xl text-charcoal
              mb-4 pb-2
              border-b border-charcoal/10
            "
          >
            Why Etymology Matters
          </h2>
          <p className="font-serif text-base text-charcoal-light leading-relaxed mb-4">
            Studying etymology offers practical benefits beyond historical curiosity:
          </p>
          <ul className="font-serif text-base text-charcoal-light leading-relaxed space-y-2 ml-6 list-disc">
            <li>
              <strong>Vocabulary expansion</strong> — Understanding roots helps you decode
              unfamiliar words
            </li>
            <li>
              <strong>Spelling improvement</strong> — Knowing a word&apos;s origin explains
              irregularities
            </li>
            <li>
              <strong>Cultural literacy</strong> — Word origins reveal historical connections
              between cultures
            </li>
            <li>
              <strong>Critical thinking</strong> — Etymology shows how meaning is constructed and
              shifts
            </li>
          </ul>
        </section>

        {/* Sources */}
        <section className="mb-12">
          <h2
            className="
              font-serif text-lg text-charcoal
              mb-3 pb-2
              border-b border-charcoal/10
            "
          >
            Sources
          </h2>
          <ul className="font-serif text-sm text-charcoal-light space-y-1">
            <li>
              <a
                href="https://www.etymonline.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-charcoal"
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
                className="underline hover:text-charcoal"
              >
                Wiktionary
              </a>{' '}
              — Wikimedia Foundation
            </li>
            <li>
              <em>The Oxford Dictionary of English Etymology</em> — C.T. Onions (1966)
            </li>
            <li>
              <em>A Short Etymological Dictionary of Modern English</em> — Ernest Weekley (1921)
            </li>
          </ul>
        </section>

        {/* CTA */}
        <div className="pt-8 border-t border-charcoal/10 text-center">
          <p className="font-serif text-charcoal-light mb-4">
            Ready to explore the origins of any word?
          </p>
          <Link
            href="/"
            className="
              inline-block
              px-6 py-3
              bg-charcoal text-cream
              font-serif
              rounded
              hover:bg-charcoal-light
              transition-colors
            "
          >
            Start Exploring
          </Link>
        </div>
      </article>
    </main>
  )
}
