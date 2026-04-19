import type { Metadata } from 'next'
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
      >
        <section className="mx-auto max-w-3xl" aria-label="Frequently asked questions">
          <p className="max-w-2xl font-serif text-xl italic leading-relaxed text-charcoal-light sm:text-[1.45rem]">
            Wondering what etymology can and cannot tell you, how the explorer chooses its sources,
            or why meanings drift so much over time? Start here.
          </p>
          <div className="editorial-double-rule mt-8" />
          <div className="mt-8">
            <FaqAccordion faqs={faqs} />
          </div>
        </section>
      </EditorialPageFrame>
    </>
  )
}
