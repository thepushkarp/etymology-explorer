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
      {/* Toggle button - fixed to left edge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          fixed left-0 top-1/2 -translate-y-1/2
          z-40
          flex items-center gap-2
          px-3 py-4
          bg-white border border-l-0 border-charcoal/10
          rounded-r-lg shadow-sm
          text-charcoal-light
          hover:text-charcoal hover:bg-cream-dark/50
          transition-all duration-300
          ${isOpen ? 'translate-x-72' : 'translate-x-0'}
        `}
        aria-label={isOpen ? 'Close history' : 'Open history'}
      >
        <svg
          className={`w-5 h-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
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

      {/* Sidebar panel */}
      <aside
        className={`
          fixed left-0 top-0 bottom-0
          z-30
          w-72
          bg-white
          border-r border-charcoal/10
          shadow-lg
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header */}
        <div
          className="
          flex items-center justify-between
          px-6 py-5
          border-b border-charcoal/10
        "
        >
          <h2 className="font-serif text-lg text-charcoal">Exploration Trail</h2>

          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="
                text-xs font-serif
                text-charcoal-light/60
                hover:text-red-600
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
          overflow-y-auto
          h-[calc(100vh-80px)]
          px-4 py-4
        "
        >
          {history.length === 0 ? (
            <div
              className="
              text-center py-12
              text-charcoal-light/50
              font-serif italic
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
                    rounded-md
                    hover:bg-cream-dark/60
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
                        text-charcoal-light/40
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
                        text-charcoal-light/30
                        hover:text-red-500
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
          bg-gradient-to-t from-white to-transparent
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
