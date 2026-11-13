import { WordLink } from '@/components/WordLink'
import { LANGUAGES } from '@/lib/languages'
import type { ScriptTarget } from '@/lib/types'

export function ScriptLinks({ targets, heading }: { targets?: ScriptTarget[]; heading?: string }) {
  if (!targets?.length) return null

  return (
    <div className="mt-4 border-l border-rule pl-3 text-sm text-muted">
      <p>
        {heading ??
          (targets.some((target) => target.language === 'ja')
            ? 'Japanese lookup'
            : 'Other language spellings')}
      </p>
      <ul className="mt-2 space-y-2">
        {targets.map((target) => (
          <li key={`${target.language}:${target.word}`}>
            {target.language !== 'ja' && `${LANGUAGES[target.language].englishName} `}
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
