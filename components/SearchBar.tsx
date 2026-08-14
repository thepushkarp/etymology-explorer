'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useHistory } from '@/lib/hooks/useHistory'
import { SearchSuggestions, useSuggestionItems } from '@/components/SearchSuggestions'
import type { LanguageCode } from '@/lib/languages'

interface SearchBarProps {
  onSearch: (word: string, entryId?: string) => void
  isLoading?: boolean
  initialValue?: string
  inputRef?: React.RefObject<HTMLInputElement | null>
  onSuggestionsVisibilityChange?: (visible: boolean) => void
  language?: LanguageCode
}

export function SearchBar({
  onSearch,
  isLoading,
  initialValue = '',
  inputRef,
  onSuggestionsVisibilityChange,
  language = 'en',
}: SearchBarProps) {
  const [value, setValue] = useState(initialValue)
  const [inputValue, setInputValue] = useState(initialValue)
  const [isFocused, setIsFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const { history: historyEntries } = useHistory()
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const historyWords = useMemo(
    () =>
      historyEntries
        .filter((entry) => (entry.language ?? 'en') === language)
        .map((entry) => entry.word),
    [historyEntries, language]
  )
  const historyEntryIds = useMemo(
    () =>
      new Map(
        historyEntries
          .filter((entry) => (entry.language ?? 'en') === language && entry.entryId !== undefined)
          .map((entry) => [entry.word, entry.entryId!])
      ),
    [historyEntries, language]
  )
  const suggestionItems = useSuggestionItems(inputValue, historyWords, language, historyEntryIds)
  const shouldShowSuggestions =
    isFocused && showSuggestions && inputValue.trim().length >= 2 && suggestionItems.length > 0

  useEffect(() => {
    const timeout = setTimeout(() => {
      setInputValue(value)
    }, 200)

    return () => clearTimeout(timeout)
  }, [value])

  // Derived clamp: when the suggestion list shrinks below the stored index,
  // treat it as "nothing selected" instead of resetting state in an effect.
  const effectiveSelectedIndex = selectedIndex < suggestionItems.length ? selectedIndex : -1

  useEffect(() => {
    onSuggestionsVisibilityChange?.(shouldShowSuggestions)
  }, [shouldShowSuggestions, onSuggestionsVisibilityChange])

  useEffect(
    () => () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
      }
    },
    []
  )

  const handleSuggestionSelect = useCallback(
    (word: string, entryId?: string) => {
      setValue(word)
      setInputValue(word)
      setShowSuggestions(false)
      setSelectedIndex(-1)
      if (entryId) onSearch(word, entryId)
      inputRef?.current?.focus()
    },
    [inputRef, onSearch]
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

      if (
        event.key === 'Enter' &&
        effectiveSelectedIndex >= 0 &&
        effectiveSelectedIndex < suggestionItems.length
      ) {
        event.preventDefault()
        const suggestion = suggestionItems[effectiveSelectedIndex]
        handleSuggestionSelect(suggestion.word, suggestion.entryId)
        return
      }

      if (event.key === 'Escape') {
        setShowSuggestions(false)
        setSelectedIndex(-1)
      }
    },
    [handleSuggestionSelect, effectiveSelectedIndex, suggestionItems]
  )

  return (
    <form onSubmit={handleSubmit} className="relative z-10 w-full">
      <div
        className={`
          group relative transition-all duration-300 ease-out
          ${isFocused ? 'translate-y-[-1px]' : ''}
        `}
      >
        <div
          className={`
            absolute inset-0 rounded-[1rem] border bg-surface/96 shadow-[0_18px_48px_-34px_var(--shadow-heavy)]
            transition-all duration-300
            ${
              isFocused
                ? 'border-border-strong shadow-[0_26px_80px_-28px_var(--shadow-heavy)]'
                : 'border-border-soft'
            }
          `}
        />

        <div className="relative rounded-[1rem]">
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1rem]">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-border-strong/80 to-transparent" />
          </div>

          <div className="relative flex items-center gap-2 rounded-[1rem] px-2.5 py-2.5 sm:px-3">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              placeholder={language === 'ja' ? 'Kanji, kana, or romaji…' : 'Enter a word...'}
              lang={language}
              disabled={isLoading}
              className={`
                min-w-0 flex-1 rounded-[0.8rem] border border-transparent bg-transparent px-2 py-3 text-lg
                tracking-[0.01em] text-charcoal outline-none placeholder:text-charcoal-light/68
                placeholder:italic disabled:opacity-50 sm:text-[1.45rem]
                ${language === 'ja' ? 'font-japanese' : 'font-serif'}
              `}
              autoComplete="off"
              spellCheck="false"
            />

            <button
              type="submit"
              disabled={isLoading || !value.trim()}
              className="
                inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-charcoal/12
                bg-charcoal text-cream shadow-sm transition-all duration-300 hover:scale-[1.03]
                hover:border-charcoal/25 hover:bg-charcoal/92 disabled:cursor-not-allowed disabled:opacity-30
                disabled:hover:scale-100 disabled:hover:bg-charcoal
              "
              aria-label="Search"
            >
              {isLoading ? <LoadingSpinner /> : <SearchIcon />}
            </button>
          </div>
        </div>

        <SearchSuggestions
          items={suggestionItems}
          isVisible={shouldShowSuggestions}
          onSelect={handleSuggestionSelect}
          selectedIndex={effectiveSelectedIndex}
        />
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
