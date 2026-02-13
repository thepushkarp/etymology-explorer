'use client'

import { useEffect, useRef, useState } from 'react'

interface KeyboardShortcutsProps {
  onFocusSearch?: () => void
  onHistoryBack?: () => void
  onHistoryForward?: () => void
  onClosePanel?: () => void
  onPlayPronunciation?: () => void
  onToggleSimpleMode?: () => void
}

interface Shortcut {
  key: string
  description: string
  keys: string[]
}

const SHORTCUTS: Shortcut[] = [
  {
    key: 'focus-search',
    description: 'Focus search bar',
    keys: ['/'],
  },
  {
    key: 'history-back',
    description: 'Previous search',
    keys: ['←'],
  },
  {
    key: 'history-forward',
    description: 'Next search',
    keys: ['→'],
  },
  {
    key: 'close-panel',
    description: 'Close panels',
    keys: ['Esc'],
  },
  {
    key: 'show-shortcuts',
    description: 'Show this help',
    keys: ['?'],
  },
  {
    key: 'play-pronunciation',
    description: 'Play pronunciation',
    keys: ['p'],
  },
  {
    key: 'toggle-simple-mode',
    description: 'Toggle simple mode',
    keys: ['s'],
  },
]

export function KeyboardShortcuts({
  onFocusSearch,
  onHistoryBack,
  onHistoryForward,
  onClosePanel,
  onPlayPronunciation,
  onToggleSimpleMode,
}: KeyboardShortcutsProps) {
  const [showOverlay, setShowOverlay] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input/textarea
      const target = e.target as HTMLElement
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'

      // Show overlay on '?' (always, even when typing)
      if (e.key === '?') {
        e.preventDefault()
        setShowOverlay(true)
        return
      }

      // Skip other shortcuts if typing
      if (isTyping) {
        return
      }

      // Handle other shortcuts
      switch (e.key) {
        case '/':
          e.preventDefault()
          onFocusSearch?.()
          break
        case 'ArrowLeft':
          e.preventDefault()
          onHistoryBack?.()
          break
        case 'ArrowRight':
          e.preventDefault()
          onHistoryForward?.()
          break
        case 'Escape':
          e.preventDefault()
          if (showOverlay) {
            setShowOverlay(false)
          } else {
            onClosePanel?.()
          }
          break
        case 'p':
        case 'P':
          e.preventDefault()
          onPlayPronunciation?.()
          break
        case 's':
        case 'S':
          e.preventDefault()
          onToggleSimpleMode?.()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    showOverlay,
    onFocusSearch,
    onHistoryBack,
    onHistoryForward,
    onClosePanel,
    onPlayPronunciation,
    onToggleSimpleMode,
  ])

  // Focus management for overlay
  useEffect(() => {
    if (showOverlay) {
      previousFocusRef.current = document.activeElement as HTMLElement
      // Focus the close button when overlay opens
      setTimeout(() => {
        const closeButton = overlayRef.current?.querySelector('button')
        closeButton?.focus()
      }, 0)
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus()
    }
  }, [showOverlay])

  // Close overlay on Escape
  useEffect(() => {
    if (!showOverlay) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowOverlay(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [showOverlay])

  return (
    <>
      {/* Overlay backdrop */}
      {showOverlay && (
        <div
          className="fixed inset-0 bg-charcoal/40 z-40 transition-opacity"
          onClick={() => setShowOverlay(false)}
          role="presentation"
        />
      )}

      {/* Overlay modal */}
      {showOverlay && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-labelledby="shortcuts-title"
          aria-modal="true"
        >
          <div
            className="
            bg-cream
            border-2 border-charcoal/20
            rounded-lg
            shadow-lg
            max-w-2xl
            w-full
            max-h-[80vh]
            overflow-y-auto
            p-8
          "
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
              <div>
                <h2
                  id="shortcuts-title"
                  className="
                  font-serif text-3xl
                  text-charcoal
                  mb-2
                "
                >
                  Keyboard Shortcuts
                </h2>
                <p className="font-serif text-charcoal-light italic">
                  Quick reference for navigation and controls
                </p>
              </div>
              <button
                onClick={() => setShowOverlay(false)}
                className="
                text-charcoal-light hover:text-charcoal
                transition-colors
                text-2xl
                leading-none
                p-2
                -mr-2
              "
                aria-label="Close shortcuts"
              >
                ×
              </button>
            </div>

            {/* Shortcuts table */}
            <div className="space-y-4">
              {SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.key}
                  className="
                  flex items-center justify-between
                  pb-4
                  border-b border-charcoal/10
                  last:border-b-0
                "
                >
                  <p className="font-serif text-charcoal">{shortcut.description}</p>
                  <div className="flex gap-2">
                    {shortcut.keys.map((k, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {idx > 0 && <span className="text-charcoal-light text-sm">or</span>}
                        <kbd
                          className="
                          inline-flex items-center justify-center
                          px-3 py-2
                          bg-charcoal/5
                          border border-charcoal/20
                          rounded
                          font-mono text-sm
                          text-charcoal
                          font-semibold
                          min-w-12
                          shadow-sm
                          hover:bg-charcoal/10
                          transition-colors
                        "
                        >
                          {k}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-charcoal/10">
              <p className="text-xs font-serif text-charcoal-light/60">
                Press{' '}
                <kbd className="inline-block px-2 py-1 bg-charcoal/5 border border-charcoal/20 rounded font-mono text-xs">
                  ?
                </kbd>{' '}
                anytime to show this help
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
