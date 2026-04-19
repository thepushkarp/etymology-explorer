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
    <section className="editorial-panel mx-auto w-full max-w-3xl animate-fadeIn p-8 text-center md:p-10">
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
        The dictionaries are useful precisely because they are willing to say when they do not know.
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
          Check your connection and try again. If the problem keeps returning, one of the upstream
          sources may simply be having a bad day.
        </p>
      )}

      <div className="mt-8 flex items-center justify-center gap-3 text-charcoal/35">
        <span className="h-px w-12 bg-current" />
        <span className="font-serif text-sm">§</span>
        <span className="h-px w-12 bg-current" />
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

/**
 * Empty state for initial page load
 */
export function EmptyState() {
  return (
    <div
      className="
      w-full max-w-xl mx-auto
      text-center
      py-16
    "
    >
      {/* Decorative book icon */}
      <div
        className="
        w-20 h-20 mx-auto mb-8
        text-charcoal/10
      "
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            opacity="0.3"
          />
          <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z" />
        </svg>
      </div>

      <h2
        className="
        font-serif text-2xl
        text-charcoal
        mb-3
      "
      >
        Discover Word Origins
      </h2>

      <p
        className="
        font-serif text-lg
        text-charcoal-light/70
        italic
        mb-2
      "
      >
        Type a word above to explore its etymology
      </p>

      <p
        className="
        text-sm
        text-charcoal-light/50
      "
      >
        Uncover the Latin roots, Greek origins, and fascinating
        <br />
        histories behind the words you encounter
      </p>

      {/* Decorative element */}
      <div
        className="
        mt-12
        text-charcoal/10
        flex items-center justify-center gap-4
      "
      >
        <span className="w-16 h-px bg-current" />
        <span className="font-serif italic text-sm">ab origine</span>
        <span className="w-16 h-px bg-current" />
      </div>
    </div>
  )
}
