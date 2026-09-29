import type { Metadata } from 'next'
import { faqs } from '@/data/faq'
import { PageFrame } from '@/components/PageFrame'
import { FaqAccordion } from '@/components/FaqAccordion'
import { FaqSchema } from '@/components/FaqSchema'

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description:
    'Common questions about etymology, word origins, and how to use EtymEx. Learn what etymology is, how words change over time, and more.',
  alternates: {
    canonical: '/faq',
  },
  openGraph: {
    title: 'FAQ - EtymEx',
    description: 'Common questions about etymology, word origins, and how to use EtymEx.',
    url: '/faq',
  },
}

export default function FaqPage() {
  return (
    <>
      <FaqSchema faqs={faqs} />
      <PageFrame title="Questions" subtitle="Short answers about words and how EtymEx traces them.">
        <FaqAccordion faqs={faqs} />
      </PageFrame>
    </>
  )
}
