import { WordLink } from '@/components/WordLink'
import { LANGUAGES } from '@/lib/languages'
import type { ScriptTarget } from '@/lib/types'

export function ScriptLinks({
  targets,
  heading,
  description,
}: {
  targets?: ScriptTarget[]
  heading?: string
  description?: string
}) {
  if (!targets?.length) return null
  const languages = [...new Set(targets.map((target) => target.language))]

  return (
    <div className="mt-4 border-l border-rule pl-3 text-sm text-muted">
      <p>
        {heading ??
          (languages.length === 1
            ? `${LANGUAGES[languages[0]].englishName} entries`
            : 'Other language entries')}
      </p>
      {description && <p className="mt-1">{description}</p>}
      <ul className="mt-2 space-y-2">
        {targets.map((target) => (
          <li key={`${target.language}:${target.word}`}>
            {languages.length > 1 && `${LANGUAGES[target.language].englishName} `}
            <WordLink
              word={target.word}
              language={target.language}
              className="link font-serif text-ink"
            />
            {target.reading && target.reading !== target.word && <span> · {target.reading}</span>}
            {target.meaning && <span> — {target.meaning}</span>}
            {target.sourceUrl && (
              <a
                className="link ml-2"
                href={target.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Source
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
