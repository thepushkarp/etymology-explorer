'use client'

import { WordSuggestion } from '@/lib/types'

interface ErrorStateProps {
  type: 'nonsense' | 'network-error' | 'typo' | 'rate-limit'
  message?: string
  suggestions?: WordSuggestion[]
  onSuggestionClick?: (word: string) => void
}

export function ErrorState({ type, message, suggestions, onSuggestionClick }: ErrorStateProps) {
  return (
    <div
      className="
      w-full max-w-2xl mx-auto
      animate-fadeIn
    "
    >
      <div
        className="
        relative
        bg-white
        rounded-lg
        border border-charcoal/10
        shadow-sm
        p-8 md:p-10
        text-center
      "
      >
        {/* Decorative element */}
        <div
          className="
          absolute top-4 left-4 right-4
          flex justify-between
          text-charcoal/10
          font-serif text-lg
        "
        >
          <span>❧</span>
          <span>❧</span>
        </div>

        {/* Icon */}
        <div
          className="
          w-16 h-16 mx-auto mb-6
          rounded-full
          bg-cream-dark
          flex items-center justify-center
        "
        >
          <ErrorIcon type={type} />
        </div>

        {/* Message */}
        <p
          className="
          font-serif text-xl
          text-charcoal
          mb-4
          italic
        "
        >
          {message || getDefaultMessage(type)}
        </p>

        {/* Typo suggestions */}
        {type === 'typo' && suggestions && suggestions.length > 0 && (
          <div className="mt-6">
            <p
              className="
              text-sm font-serif
              text-charcoal-light
              mb-4
            "
            >
              Perhaps you meant:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.word}
                  onClick={() => onSuggestionClick?.(suggestion.word)}
                  className="
                    px-4 py-2
                    font-serif
                    bg-cream-dark/60
                    rounded-full
                    border border-charcoal/10
                    hover:border-charcoal/30
                    hover:bg-cream-dark
                    transition-all duration-200
                  "
                >
                  {suggestion.word}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Network error - retry hint */}
        {(type === 'network-error' || type === 'rate-limit') && (
          <p
            className="
            mt-4
            text-sm font-serif
            text-charcoal-light/70
          "
          >
            Check your connection and try again
          </p>
        )}

        {/* Decorative footer */}
        <div
          className="
          mt-8 pt-6
          border-t border-charcoal/5
          text-charcoal/20
          flex items-center justify-center gap-3
        "
        >
          <span className="w-12 h-px bg-current" />
          <span className="text-sm font-serif">§</span>
          <span className="w-12 h-px bg-current" />
        </div>
      </div>
    </div>
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
    case 'rate-limit':
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
            d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
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
      return "That's not a word — though it does have a certain Proto-Keyboard charm."
    case 'network-error':
      return 'Something went awry in the ether...'
    case 'rate-limit':
      return 'You are searching too quickly. Please wait a moment and try again.'
    case 'typo':
      return "We couldn't find that word in our lexicon."
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
