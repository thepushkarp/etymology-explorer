import type { Metadata } from 'next'
import Link from 'next/link'
import { faqs } from '@/data/faq'
import { EditorialPageFrame } from '@/components/EditorialPageFrame'
import { FaqAccordion } from '@/components/FaqAccordion'
import { FaqSchema } from '@/components/FaqSchema'

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
      <EditorialPageFrame
        eyebrow="frequently asked"
        title="Questions about words, and the people who used them."
        subtitle="The short answers, set out plainly, for curious readers and repeat searchers alike."
        showHeaderRule={false}
      >
        <section className="mx-auto max-w-3xl" aria-label="Frequently asked questions">
          <div>
            <FaqAccordion faqs={faqs} />
          </div>
          <div className="editorial-card mt-12 flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-serif text-xl italic text-charcoal-light">still curious?</p>
              <p className="mt-2 font-serif text-3xl tracking-[-0.03em] text-charcoal">
                Pick a word and start digging.
              </p>
            </div>
            <Link href="/" className="editorial-chip self-start font-serif italic sm:self-center">
              explore the archive →
            </Link>
          </div>
        </section>
      </EditorialPageFrame>
    </>
  )
}
