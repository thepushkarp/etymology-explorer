'use client'

import { useState, useEffect } from 'react'
import { HistoryEntry } from '@/lib/types'

interface HistorySidebarProps {
  history: HistoryEntry[]
  onWordClick: (word: string) => void
  onClearHistory: () => void
  onRemoveEntry: (word: string) => void
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

  return (
    <>
      {/* Mobile drawer toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          fixed left-4 top-[5.9rem] z-40 inline-flex items-center gap-2 rounded-full border
          border-border-soft bg-surface/96 px-3 py-2 text-charcoal-light shadow-[0_18px_44px_-28px_var(--shadow-heavy)]
          transition-all duration-300 hover:bg-cream-dark/55 hover:text-charcoal md:hidden
          ${isOpen ? 'pointer-events-none opacity-0' : 'opacity-100'}
        `}
        aria-label={isOpen ? 'Close history' : 'Open history'}
      >
        <svg
          className="h-4.5 w-4.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h10M4 17h16" />
        </svg>
        <span className="text-[10.5px] uppercase tracking-[0.2em]">History</span>

        {history.length > 0 && (
          <span
            className="
            inline-flex h-5 min-w-5 items-center justify-center rounded-full
            bg-charcoal px-1 text-[10px] font-serif text-cream
          "
          >
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
        className={`
          fixed z-30 flex flex-col bg-surface/97 shadow-[0_24px_60px_-30px_var(--shadow-heavy)]
          transition-transform duration-300 ease-out
          left-3 bottom-3 top-[9.1rem] right-3 rounded-[1.15rem] border border-border-soft
          md:left-0 md:right-auto md:top-0 md:bottom-0 md:w-72 md:rounded-none md:border-r md:border-l-0 md:border-y-0
          ${isOpen ? 'translate-x-0' : '-translate-x-[105%] md:-translate-x-full'}
        `}
      >
        {/* Header */}
        <div
          className="
          flex items-center justify-between
          px-6 py-5
          border-b border-border-soft
        "
        >
          <div className="flex items-start gap-3">
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
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-charcoal-light/62">
                history
              </p>
              <h2 className="mt-2 font-serif text-lg text-charcoal">Exploration Trail</h2>
            </div>
          </div>

          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="
                text-xs font-serif
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
                  key={entry.word}
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
                      onClick={() => onWordClick(entry.word)}
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
                        onRemoveEntry(entry.word)
                      }}
                      className="
                        px-2 py-2
                        text-charcoal-light/50
                        hover:text-red-500 dark:hover:text-red-400
                        opacity-0 group-hover:opacity-100
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
            fixed inset-0 z-20
            bg-charcoal/10
            md:hidden
          "
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
