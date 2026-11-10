import { WordLink } from '@/components/WordLink'
import { LANGUAGES } from '@/lib/languages'
import type { ScriptTarget } from '@/lib/types'

export function ScriptLinks({ targets }: { targets?: ScriptTarget[] }) {
  if (!targets?.length) return null

  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2 text-sm text-muted">
      <span>In other scripts</span>
      {targets.map((target) => (
        <span key={`${target.language}:${target.word}`}>
          {LANGUAGES[target.language].englishName}{' '}
          <WordLink
            word={target.word}
            language={target.language}
            className="link font-serif text-ink"
          />
        </span>
      ))}
    </p>
  )
}
