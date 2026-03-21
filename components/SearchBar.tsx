'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useHistory } from '@/lib/hooks/useHistory'
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
  const { history: historyEntries } = useHistory()
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
      inputRef?.current?.focus()
    },
    [inputRef]
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
    <form onSubmit={handleSubmit} className="relative z-10 mx-auto w-full max-w-3xl">
      <div
        className={`
          group relative transition-all duration-300 ease-out
          ${isFocused ? 'translate-y-[-1px]' : ''}
        `}
      >
        <div
          className={`
            absolute inset-0 rounded-[1.75rem] border bg-surface/92 shadow-[0_22px_50px_-28px_var(--shadow-color)]
            backdrop-blur-sm transition-all duration-300
            ${
              isFocused
                ? 'border-border-strong shadow-[0_28px_64px_-30px_var(--shadow-color)]'
                : 'border-border-soft'
            }
          `}
        />

        <div className="relative rounded-[1.75rem]">
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]">
            <div className="h-full w-full bg-gradient-to-r from-transparent via-cream-dark/55 to-transparent opacity-70" />
          </div>

          <div className="relative flex items-center gap-2 rounded-[1.75rem] px-3 py-3 sm:px-4">
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
                min-w-0 flex-1 rounded-[1.2rem] border border-transparent bg-transparent px-4 py-4 text-lg
                font-serif tracking-[0.01em] text-charcoal outline-none placeholder:text-charcoal-light/68
                placeholder:italic disabled:opacity-50 sm:text-xl
              "
              autoComplete="off"
              spellCheck="false"
            />

            <button
              type="submit"
              disabled={isLoading || !value.trim()}
              className="
                inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-charcoal/12
                bg-charcoal text-cream shadow-sm transition-all duration-300 hover:scale-[1.03]
                hover:border-charcoal/25 hover:bg-charcoal/92 disabled:cursor-not-allowed disabled:opacity-30
                disabled:hover:scale-100 disabled:hover:bg-charcoal
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
    <MagnifyingGlassIcon className="h-[22px] w-[22px] transition-transform group-hover:scale-105" />
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
