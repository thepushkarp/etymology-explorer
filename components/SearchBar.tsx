'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useLocalStorage } from '@/lib/hooks/useLocalStorage'
import type { HistoryEntry } from '@/lib/types'
import { SearchSuggestions, getSuggestionItems } from '@/components/SearchSuggestions'

interface SearchBarProps {
  onSearch: (word: string) => void
  isLoading?: boolean
  initialValue?: string
  inputRef?: React.RefObject<HTMLInputElement | null>
}

export function SearchBar({ onSearch, isLoading, initialValue = '', inputRef }: SearchBarProps) {
  const [value, setValue] = useState(initialValue)
  const [inputValue, setInputValue] = useState(initialValue)
  const [isFocused, setIsFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [historyEntries] = useLocalStorage<HistoryEntry[]>('etymology-history', [])
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchParams = useSearchParams()

  const historyWords = useMemo(() => historyEntries.map((entry) => entry.word), [historyEntries])
  const suggestionItems = useMemo(
    () => getSuggestionItems(inputValue, historyWords),
    [inputValue, historyWords]
  )
  const shouldShowSuggestions =
    isFocused && showSuggestions && inputValue.trim().length >= 2 && suggestionItems.length > 0

  // Sync with URL on mount - intentional URL → state sync pattern
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && q !== value) {
      setValue(q)
      setInputValue(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setInputValue(value)
    }, 200)

    return () => clearTimeout(timeout)
  }, [value])

  useEffect(() => {
    if (selectedIndex >= suggestionItems.length) {
      setSelectedIndex(-1)
    }
  }, [selectedIndex, suggestionItems.length])

  useEffect(
    () => () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
      }
    },
    []
  )

  const handleSuggestionSelect = useCallback(
    (word: string) => {
      setValue(word)
      setInputValue(word)
      setShowSuggestions(false)
      setSelectedIndex(-1)

      if (!isLoading) {
        onSearch(word)
      }
    },
    [isLoading, onSearch]
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = value.trim()
      if (trimmed && !isLoading) {
        setShowSuggestions(false)
        setSelectedIndex(-1)
        onSearch(trimmed)
      }
    },
    [value, isLoading, onSearch]
  )

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    setValue(nextValue)
    setSelectedIndex(-1)
    setShowSuggestions(nextValue.trim().length >= 2)
  }, [])

  const handleInputFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }

    setIsFocused(true)
    setShowSuggestions(value.trim().length >= 2)
  }, [value])

  const handleInputBlur = useCallback(() => {
    setIsFocused(false)

    blurTimeoutRef.current = setTimeout(() => {
      setShowSuggestions(false)
      setSelectedIndex(-1)
    }, 200)
  }, [])

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        if (suggestionItems.length === 0) {
          return
        }

        event.preventDefault()
        setShowSuggestions(true)
        setSelectedIndex((prev) => (prev >= suggestionItems.length - 1 ? 0 : prev + 1))
        return
      }

      if (event.key === 'ArrowUp') {
        if (suggestionItems.length === 0) {
          return
        }

        event.preventDefault()
        setShowSuggestions(true)
        setSelectedIndex((prev) => (prev <= 0 ? suggestionItems.length - 1 : prev - 1))
        return
      }

      if (event.key === 'Enter' && selectedIndex >= 0 && selectedIndex < suggestionItems.length) {
        event.preventDefault()
        handleSuggestionSelect(suggestionItems[selectedIndex].word)
        return
      }

      if (event.key === 'Escape') {
        setShowSuggestions(false)
        setSelectedIndex(-1)
      }
    },
    [handleSuggestionSelect, selectedIndex, suggestionItems]
  )

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div
        className={`
          relative group
          transition-all duration-500 ease-out
          ${isFocused ? 'transform scale-[1.02]' : ''}
        `}
      >
        {/* Decorative border frame */}
        <div
          className={`
            absolute -inset-3 rounded-xl
            border border-border-soft
            transition-all duration-500
            ${isFocused ? 'border-charcoal/30 dark:border-cream/35 -inset-4' : ''}
          `}
        />

        {/* Decorative corners */}
        <div className="absolute -top-3 -left-3 w-6 h-6 border-l-2 border-t-2 border-charcoal/20 dark:border-cream/30 rounded-tl-lg" />
        <div className="absolute -top-3 -right-3 w-6 h-6 border-r-2 border-t-2 border-charcoal/20 dark:border-cream/30 rounded-tr-lg" />
        <div className="absolute -bottom-3 -left-3 w-6 h-6 border-l-2 border-b-2 border-charcoal/20 dark:border-cream/30 rounded-bl-lg" />
        <div className="absolute -bottom-3 -right-3 w-6 h-6 border-r-2 border-b-2 border-charcoal/20 dark:border-cream/30 rounded-br-lg" />

        {/* Main input container */}
        <div className="relative">
          <div className="relative bg-surface dark:bg-surface rounded-lg shadow-sm overflow-hidden">
            {/* Subtle paper texture overlay */}
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
              }}
            />

            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              placeholder="Enter a word to explore its roots..."
              disabled={isLoading}
              className="
                w-full px-8 py-5 text-xl
                bg-transparent
                border-none outline-none
                 font-serif text-charcoal dark:text-cream
                 placeholder:text-charcoal-light/70 dark:placeholder:text-cream/65
                placeholder:italic
                disabled:opacity-50
                tracking-wide
              "
              autoComplete="off"
              spellCheck="false"
            />

            {/* Animated underline */}
            <div
              className={`
                absolute bottom-0 left-1/2 -translate-x-1/2
                h-px bg-gradient-to-r from-transparent via-charcoal/45 dark:via-cream/50 to-transparent
                transition-all duration-500 ease-out
                ${isFocused ? 'w-[90%]' : 'w-0'}
              `}
            />

            {/* Search button */}
            <button
              type="submit"
              disabled={isLoading || !value.trim()}
              className="
                absolute right-4 top-1/2 -translate-y-1/2
                p-3 rounded-full
                 text-charcoal dark:text-cream
                 hover:text-charcoal dark:hover:text-cream hover:bg-cream-dark/50 dark:hover:bg-cream/10
                transition-all duration-300
                disabled:opacity-30 disabled:cursor-not-allowed
                disabled:hover:bg-transparent
              "
              aria-label="Search"
            >
              {isLoading ? <LoadingSpinner /> : <SearchIcon />}
            </button>
          </div>

          <SearchSuggestions
            query={inputValue}
            history={historyWords}
            isVisible={shouldShowSuggestions}
            onSelect={handleSuggestionSelect}
            selectedIndex={selectedIndex}
          />
        </div>
      </div>
    </form>
  )
}

function SearchIcon() {
  return (
    <MagnifyingGlassIcon className="h-[22px] w-[22px] transition-transform group-hover:scale-110" />
  )
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.8" />
    </svg>
  )
}
