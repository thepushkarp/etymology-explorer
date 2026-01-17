/**
 * FAQ Accordion Component
 *
 * Renders FAQ items as expandable/collapsible sections.
 * Uses native <details>/<summary> for accessibility (works without JS).
 */

import { FaqItem } from '@/data/faq'
import Link from 'next/link'

interface FaqAccordionProps {
  faqs: FaqItem[]
}

interface FaqItemProps {
  faq: FaqItem
}

function FaqAccordionItem({ faq }: FaqItemProps) {
  return (
    <details className="group border-b border-charcoal/10 last:border-b-0">
      <summary
        className="
          flex cursor-pointer items-center justify-between
          py-5 pr-2
          font-serif text-lg text-charcoal
          list-none
          hover:text-charcoal-light
          transition-colors
          [&::-webkit-details-marker]:hidden
        "
      >
        <span>{faq.question}</span>
        <span
          className="
            ml-4 text-xl text-charcoal/40
            transition-transform duration-200
            group-open:rotate-45
          "
        >
          +
        </span>
      </summary>
      <div
        className="
          pb-5 pr-8
          font-serif text-base text-charcoal-light
          leading-relaxed
        "
      >
        <p>{faq.answer}</p>
        {faq.searchExample && (
          <p className="mt-3 text-sm">
            <Link
              href={`/?q=${encodeURIComponent(faq.searchExample)}`}
              className="text-charcoal underline hover:text-charcoal-light"
            >
              Try searching for &ldquo;{faq.searchExample}&rdquo; &rarr;
            </Link>
          </p>
        )}
      </div>
    </details>
  )
}

export function FaqAccordion({ faqs }: FaqAccordionProps) {
  return (
    <div className="border-t border-charcoal/10">
      {faqs.map((faq) => (
        <FaqAccordionItem key={faq.question} faq={faq} />
      ))}
    </div>
  )
}
