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
  index: number
}

function FaqAccordionItem({ faq, index }: FaqItemProps) {
  return (
    <details className="group border-b border-border-soft" open={index === 0}>
      <summary
        className="
          flex cursor-pointer items-start gap-5
          py-7
          font-serif text-lg text-charcoal
          list-none
          hover:text-charcoal-light
          transition-colors
          [&::-webkit-details-marker]:hidden
        "
      >
        <span className="min-w-8 pt-0.5 font-serif text-lg italic text-charcoal-light/72">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="flex-1 text-[1.65rem] leading-[1.2] tracking-[-0.02em]">
          {faq.question}
        </span>
        <span
          className="
            ml-4 pt-0.5 text-[1.7rem] italic text-charcoal/55
            transition-transform duration-200
            group-open:rotate-45
          "
        >
          +
        </span>
      </summary>
      <div
        className="
          pb-6 pl-[3.25rem] pr-8
          font-serif text-[1.05rem] text-charcoal-light
          leading-relaxed
        "
      >
        <p>{faq.answer}</p>
        {faq.searchExample && (
          <p className="mt-3 text-sm">
            <Link
              href={`/?q=${encodeURIComponent(faq.searchExample)}`}
              className="editorial-link text-charcoal hover:text-charcoal-light"
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
    <div>
      {faqs.map((faq, index) => (
        <FaqAccordionItem key={faq.question} faq={faq} index={index} />
      ))}
    </div>
  )
}
