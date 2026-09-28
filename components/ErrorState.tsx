import type { StreamingUiError } from '@/lib/streamingError'
import type { LanguageCode } from '@/lib/languages'
import { WordLink } from './WordLink'

const DEFAULT_MESSAGES: Record<StreamingUiError['type'], string> = {
  nonsense: 'That word does not appear in the record.',
  typo: 'We could not find that exact word.',
  'network-error': 'The trail went cold for a moment.',
}

interface ErrorStateProps {
  error: StreamingUiError
  language: LanguageCode
  onRetry?: () => void
}

export function ErrorState({ error, language, onRetry }: ErrorStateProps) {
  return (
    <div className="animate-rise mt-8 max-w-2xl" role="alert">
      <p className="font-serif text-xl leading-relaxed text-ink">
        {error.message || DEFAULT_MESSAGES[error.type]}
      </p>

      {error.suggestions.length > 0 && (
        <p className="mt-6 font-serif text-lg text-muted">
          Perhaps{' '}
          {error.suggestions.map((suggestion, index) => (
            <span key={suggestion.word}>
              {index > 0 && (index === error.suggestions.length - 1 ? ' or ' : ', ')}
              <WordLink word={suggestion.word} language={language} className="link text-ink" />
            </span>
          ))}
          ?
        </p>
      )}

      {error.type === 'network-error' && onRetry && (
        <button type="button" onClick={onRetry} className="link mt-6 text-muted">
          Try again
        </button>
      )}
    </div>
  )
}
