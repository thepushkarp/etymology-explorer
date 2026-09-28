import type { FaqItem } from '@/data/faq'
import { WordLink } from './WordLink'

/** Native <details> rows: accessible and working without JavaScript. */
export function FaqAccordion({ faqs }: { faqs: FaqItem[] }) {
  return (
    <div className="border-t border-rule">
      {faqs.map((faq, index) => (
        <details key={faq.question} className="group border-b border-rule" open={index === 0}>
          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 py-5 font-serif text-lg text-ink transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
            {faq.question}
            <span
              aria-hidden="true"
              className="text-muted transition-transform duration-200 group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="animate-rise max-w-2xl pb-6 font-serif leading-relaxed text-muted">
            <p>{faq.answer}</p>
            {faq.searchExample && (
              <p className="mt-3 text-sm">
                Try <WordLink word={faq.searchExample} className="link text-ink" />
              </p>
            )}
          </div>
        </details>
      ))}
    </div>
  )
}
