import type { LanguageCode } from '@/lib/languages'
import type { UsageExample } from '@/lib/types'
import { emphasize } from './StoryText'

/**
 * Two contrasting usage sentences, set as a dictionary sets citations: italic
 * serif, with any *marked* form standing upright against the italics. A
 * foreign-language example carries its English translation as a quiet gloss.
 */
export function ExamplesList({
  examples,
  language,
}: {
  examples: UsageExample[]
  language: LanguageCode
}) {
  return (
    <ol className="max-w-2xl space-y-5">
      {examples.map((example, index) => (
        <li key={index}>
          <p
            lang={language}
            className="font-serif text-lg italic leading-[1.7] text-ink [&_em]:not-italic"
          >
            {emphasize(example.text)}
          </p>
          {example.translation && (
            <p className="mt-1 text-sm leading-relaxed text-muted">{example.translation}</p>
          )}
        </li>
      ))}
    </ol>
  )
}
