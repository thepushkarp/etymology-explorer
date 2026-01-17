/**
 * FAQPage JSON-LD Schema Generator
 *
 * Generates structured data for Google rich results from FAQ content.
 * Uses the same data source as the visible FAQ UI to ensure sync.
 *
 * SECURITY NOTE: This component uses innerHTML for JSON-LD injection.
 * This is safe ONLY because `faqs` data is hardcoded in `data/faq.ts`,
 * not user-provided. Never pass user input to this component.
 */

import { FaqItem } from '@/data/faq'

interface FaqSchemaProps {
  faqs: FaqItem[]
}

/**
 * Strips any potential HTML/markdown from answer text for schema
 * (Currently answers are plain text, but this future-proofs)
 */
function stripMarkup(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

export function FaqSchema({ faqs }: FaqSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: stripMarkup(faq.answer),
      },
    })),
  }

  // Safe: schema is derived from static data in data/faq.ts, not user input
  // XSS sanitization: replace < with unicode equivalent per Next.js docs
  // See existing pattern: components/JsonLd.tsx:40-47
  const jsonString = JSON.stringify(schema).replace(/</g, '\\u003c')

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonString }} />
}
