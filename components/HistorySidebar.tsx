'use client'

import { useState, useEffect } from 'react'
import { HistoryEntry } from '@/lib/types'
import { BETA_SYMBOL, type LanguageCode } from '@/lib/languages'

interface HistorySidebarProps {
  history: HistoryEntry[]
  onWordClick: (word: string, language: LanguageCode, entryId?: string) => void
  onClearHistory: () => void
  onRemoveEntry: (word: string, language?: LanguageCode, entryId?: string) => void
}

// Format relative time - pure function
function formatRelativeTime(timestamp: number, now: number): string {
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export function HistorySidebar({
  history,
  onWordClick,
  onClearHistory,
  onRemoveEntry,
}: HistorySidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  // Initialize with current time to avoid hydration mismatch, update via interval
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  // Update timestamps periodically (every 60 seconds) for relative time display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const handleWordClick = (word: string, language: LanguageCode, entryId?: string) => {
    setIsOpen(false)
    onWordClick(word, language, entryId)
  }

  return (
    <>
      {/* Mobile drawer toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          fixed bottom-4 left-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border
          border-border-soft bg-surface text-charcoal-light shadow-[0_18px_44px_-24px_var(--shadow-heavy)]
          transition-all duration-300 hover:bg-cream-dark/55 hover:text-charcoal md:hidden
          ${isOpen ? 'pointer-events-none scale-90 opacity-0' : 'scale-100 opacity-100'}
        `}
        aria-label={isOpen ? 'Close history' : 'Open history'}
        aria-expanded={isOpen}
        aria-controls="exploration-history"
      >
        <svg
          className={`h-5 w-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>

        {!isOpen && history.length > 0 && (
          <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-charcoal text-xs font-serif text-cream">
            {history.length > 9 ? '9+' : history.length}
          </span>
        )}
      </button>

      {/* Desktop rail toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          fixed left-0 top-1/2 z-40 hidden items-center gap-2 rounded-r-[1rem] border border-l-0
          border-border-soft bg-surface/96 px-3 py-4 text-charcoal-light shadow-[0_18px_44px_-28px_var(--shadow-heavy)]
          transition-all duration-300 hover:bg-cream-dark/55 hover:text-charcoal md:flex
          ${isOpen ? 'translate-x-72' : 'translate-x-0'}
        `}
        aria-label={isOpen ? 'Close history' : 'Open history'}
        aria-expanded={isOpen}
        aria-controls="exploration-history"
      >
        <svg
          className={`h-5 w-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>

        {!isOpen && history.length > 0 && (
          <span
            className="
            absolute -top-2 -right-2
            w-5 h-5
            bg-charcoal text-cream
            text-xs font-serif
            rounded-full
            flex items-center justify-center
          "
          >
            {history.length > 9 ? '9+' : history.length}
          </span>
        )}
      </button>

      {/* Drawer panel */}
      <aside
        id="exploration-history"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exploration-history-title"
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={`
          fixed bottom-0 left-0 top-0 z-50 flex w-[min(21rem,88vw)] flex-col border-r border-border-soft bg-surface
          shadow-[0_24px_70px_-24px_var(--shadow-heavy)]
          transition-transform duration-300 ease-out
          md:w-72
          ${isOpen ? 'translate-x-0' : 'pointer-events-none -translate-x-full'}
        `}
      >
        {/* Header */}
        <div
          className="
          flex items-center justify-between
          px-5 py-5
          border-b border-border-soft
        "
        >
          <div className="min-w-0 flex items-start gap-3">
            <button
              onClick={() => setIsOpen(false)}
              className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-surface text-charcoal-light transition-colors hover:bg-cream-dark/55 hover:text-charcoal md:hidden"
              aria-label="Collapse history drawer"
            >
              <svg
                className="h-4.5 w-4.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
                history
              </p>
              <h2
                id="exploration-history-title"
                className="mt-1.5 truncate font-serif text-lg text-charcoal"
              >
                Exploration Trail
              </h2>
            </div>
          </div>

          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="
                shrink-0 text-xs font-serif
                text-charcoal-light/60
                hover:text-red-600 dark:hover:text-red-400
                transition-colors
              "
            >
              Clear all
            </button>
          )}
        </div>

        {/* History list */}
        <div
          className="
          min-h-0 flex-1 overflow-y-auto
          px-4 py-4
        "
        >
          {history.length === 0 ? (
            <div
              className="
              py-12 text-center font-serif italic text-charcoal-light/50
            "
            >
              <p className="mb-2">No words explored yet</p>
              <p className="text-sm">
                Your journey through
                <br />
                etymology begins here
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {history.map((entry, index) => (
                <li
                  key={`${entry.language ?? 'en'}:${entry.entryId ?? entry.word}`}
                  className="animate-fadeIn"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div
                    className="
                    group
                    flex items-center
                    rounded-[0.9rem]
                    border border-transparent
                    hover:border-border-soft hover:bg-cream-dark/45
                    transition-colors
                  "
                  >
                    <button
                      onClick={() =>
                        handleWordClick(entry.word, entry.language ?? 'en', entry.entryId)
                      }
                      className="
                        flex-1
                        flex items-center justify-between
                        px-3 py-2.5
                        text-left
                      "
                    >
                      <span
                        className="
                        font-serif text-charcoal
                        group-hover:underline
                        underline-offset-4
                        decoration-charcoal/30
                      "
                      >
                        {entry.word}
                        {entry.language && entry.language !== 'en' && (
                          <small className="ml-2 uppercase text-charcoal-light/55">
                            {entry.language} ·{' '}
                            <span className="normal-case font-serif">{BETA_SYMBOL}</span>
                          </small>
                        )}
                      </span>
                      <span
                        className="
                        text-xs font-serif
                        text-charcoal-light/55
                      "
                      >
                        {formatRelativeTime(entry.timestamp, currentTime)}
                      </span>
                    </button>

                    {/* Remove button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveEntry(entry.word, entry.language ?? 'en', entry.entryId)
                      }}
                      className="
                        px-2 py-2
                        text-charcoal-light/50
                        hover:text-red-500 dark:hover:text-red-400
                        opacity-70 sm:opacity-0 sm:group-hover:opacity-100
                        transition-all
                      "
                      aria-label={`Remove ${entry.word}`}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Decorative footer */}
        <div
          className="
          absolute bottom-0 left-0 right-0
          h-16
          bg-gradient-to-t from-surface/94 to-transparent
          pointer-events-none
        "
        />
      </aside>

      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="
            fixed inset-0 z-40
            bg-charcoal/35 backdrop-blur-[1px]
            md:hidden
          "
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
