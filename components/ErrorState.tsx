'use client'

import { WordSuggestion } from '@/lib/types'

interface ErrorStateProps {
  type: 'nonsense' | 'network-error' | 'typo'
  message?: string
  suggestions?: WordSuggestion[]
  onSuggestionClick?: (word: string) => void
}

export function ErrorState({ type, message, suggestions, onSuggestionClick }: ErrorStateProps) {
  return (
    <section className="editorial-shell mx-auto w-full max-w-4xl animate-fadeIn p-8 md:p-10">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:items-start">
        <div className="text-center md:text-left">
          <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
            {type === 'typo'
              ? 'not found'
              : type === 'network-error'
                ? 'connection issue'
                : 'unknown word'}
          </p>

          <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-full border border-border-soft bg-surface">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-dark/75">
              <ErrorIcon type={type} />
            </div>
          </div>

          <h2 className="mx-auto mt-6 max-w-2xl font-serif text-3xl tracking-[-0.04em] text-charcoal md:text-4xl">
            {message || getDefaultMessage(type)}
          </h2>

          <p className="mx-auto mt-4 max-w-xl font-serif text-lg italic leading-relaxed text-charcoal-light">
            The dictionaries are useful precisely because they are willing to say when they do not
            know.
          </p>

          {type === 'typo' && suggestions && suggestions.length > 0 && (
            <div className="mx-auto mt-8 max-w-2xl border-t border-border-soft pt-6">
              <p className="text-[11px] uppercase tracking-[0.22em] text-charcoal-light/62">
                Perhaps you meant
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.word}
                    onClick={() => onSuggestionClick?.(suggestion.word)}
                    className="rounded-full border border-border-soft bg-surface px-4 py-2 font-serif italic text-charcoal transition-colors hover:border-border-strong hover:bg-cream-dark/55"
                  >
                    {suggestion.word}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'network-error' && (
            <p className="mt-6 text-sm leading-relaxed text-charcoal-light">
              Check your connection and try again. If the problem keeps returning, one of the
              upstream sources may simply be having a bad day.
            </p>
          )}
        </div>

        <aside className="editorial-card p-6 text-left">
          <p className="editorial-kicker">in the margin</p>
          <p className="mt-4 font-serif text-[1.65rem] leading-[1.15] tracking-[-0.03em] text-charcoal">
            {type === 'typo'
              ? 'Try the nearest recorded forms.'
              : type === 'network-error'
                ? 'The archive is reachable, but one trail has gone dim.'
                : 'Some words arrive before the record catches them.'}
          </p>
          <p className="mt-4 font-serif italic leading-relaxed text-charcoal-light">
            {type === 'typo'
              ? 'Older spellings, close variants, or neighboring words are often enough to reopen the trail.'
              : type === 'network-error'
                ? 'This usually means an upstream source is slow or unavailable for a moment, not that the word is impossible to trace.'
                : 'When the dictionaries do not recognize a form, the best fallback is to search a neighboring root or an earlier spelling.'}
          </p>
          <div className="editorial-double-rule mt-6" />
          <div className="mt-6 flex items-center gap-3 text-charcoal/35">
            <span className="h-px w-12 bg-current" />
            <span className="font-serif text-sm">§</span>
            <span className="h-px w-12 bg-current" />
          </div>
        </aside>
      </div>
    </section>
  )
}

function ErrorIcon({ type }: { type: string }) {
  const iconClass = 'w-8 h-8 text-charcoal-light'

  switch (type) {
    case 'nonsense':
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
          />
        </svg>
      )
    case 'network-error':
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      )
    case 'typo':
      return (
        <svg
          className={iconClass}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
      )
    default:
      return null
  }
}

function getDefaultMessage(type: string): string {
  switch (type) {
    case 'nonsense':
      return "That doesn't appear in the record."
    case 'network-error':
      return 'The trail went cold for a moment.'
    case 'typo':
      return "We couldn't find that exact word."
    default:
      return 'Something unexpected happened.'
  }
}
