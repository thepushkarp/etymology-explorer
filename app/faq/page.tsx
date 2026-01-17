import type { Metadata } from 'next'
import Link from 'next/link'
import { faqs } from '@/data/faq'
import { FaqSchema } from '@/components/FaqSchema'
import { FaqAccordion } from '@/components/FaqAccordion'

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description:
    'Common questions about etymology, word origins, and how to use Etymology Explorer. Learn what etymology is, how words change over time, and more.',
  alternates: {
    canonical: '/faq',
  },
  openGraph: {
    title: 'FAQ - Etymology Explorer',
    description:
      'Common questions about etymology, word origins, and how to use Etymology Explorer.',
    url: '/faq',
  },
}

export default function FaqPage() {
  return (
    <>
      <FaqSchema faqs={faqs} />

      <main className="min-h-screen bg-cream py-12 md:py-20 px-4">
        <div className="max-w-2xl mx-auto">
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
              "
            >
              Frequently Asked Questions
            </h1>
            <p className="font-serif text-lg text-charcoal-light">
              Common questions about etymology and word origins.
            </p>
          </header>

          {/* FAQ Accordion */}
          <section aria-label="Frequently asked questions">
            <FaqAccordion faqs={faqs} />
          </section>

          {/* CTA */}
          <div className="mt-12 pt-8 border-t border-charcoal/10 text-center">
            <p className="font-serif text-charcoal-light mb-4">Ready to explore word origins?</p>
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
        </div>
      </main>
    </>
  )
}
