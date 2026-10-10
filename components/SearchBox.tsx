'use client'

import { useId, useRef, useState } from 'react'
import { EnterIcon, SearchIcon } from '@/components/Icons'
import { useHotkey } from '@/lib/hooks/useHotkey'
import { useSuggestions } from '@/lib/hooks/useSuggestions'
import { useWordNavigation } from '@/lib/hooks/useWordNavigation'
import { canonicalizeWord, isValidWord } from '@/lib/validation'
import type { LanguageCode } from '@/lib/languages'

interface SearchBoxProps {
  language: LanguageCode
  size?: 'large' | 'compact'
  autoFocus?: boolean
}

/**
 * Dictionary lookup with wordlist suggestions. The submit button looks up the
 * typed text; Enter accepts a highlighted suggestion while the list is open.
 * `/` focuses the field from anywhere.
 */
export function SearchBox({ language, size = 'compact', autoFocus = false }: SearchBoxProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const errorId = useId()
  const navigateToWord = useWordNavigation()
  const suggestions = useSuggestions(value, language)
  const showList = open && suggestions.length > 0
  const activeIndex = active < suggestions.length ? active : -1

  useHotkey('/', () => inputRef.current?.focus())

  const go = (word: string) => {
    const trimmed = canonicalizeWord(word)
    if (!isValidWord(trimmed)) {
      setOpen(false)
      setError('Enter a word or expression first!')
      return
    }
    setError('')
    setOpen(false)
    setActive(-1)
    inputRef.current?.blur()
    navigateToWord(trimmed, language)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const count = suggestions.length
    if (event.key === 'ArrowDown' && count > 0) {
      event.preventDefault()
      setOpen(true)
      setActive((index) => (index + 1) % count)
    } else if (event.key === 'ArrowUp' && count > 0) {
      event.preventDefault()
      setOpen(true)
      setActive((index) => (index <= 0 ? count - 1 : index - 1))
    } else if (event.key === 'Enter' && showList && activeIndex >= 0) {
      event.preventDefault()
      go(suggestions[activeIndex])
    } else if (event.key === 'Escape') {
      // Dismiss suggestions without the search input's native clear action.
      event.preventDefault()
      if (showList) setOpen(false)
      else inputRef.current?.blur()
    }
  }

  const large = size === 'large'

  return (
    <form
      role="search"
      // min-w-0: as a flex item the form would otherwise refuse to shrink
      // below the input's intrinsic width and push siblings off-screen.
      className="relative w-full min-w-0"
      onSubmit={(event) => {
        event.preventDefault()
        go(value)
      }}
    >
      <div className="flex items-center border border-rule transition-colors duration-200 focus-within:border-muted">
        <input
          ref={inputRef}
          type="search"
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => {
            setValue(event.target.value)
            setError('')
            setActive(-1)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={large ? 'Word or expression' : 'Look up…'}
          aria-label="Look up a word or expression"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          className={`min-w-0 flex-1 bg-transparent font-serif text-ink outline-none placeholder:text-muted placeholder:italic [&::-webkit-search-cancel-button]:hidden ${
            large ? 'px-3 py-3 text-base sm:px-4 sm:py-4 sm:text-3xl' : 'px-2 py-2 text-base'
          }`}
        />
        <button
          type="submit"
          aria-label={large ? undefined : 'Look up'}
          className={`flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-2 self-stretch border-l border-rule bg-transparent font-sans text-ink transition-colors hover:bg-wash hover:text-accent ${
            large ? 'px-3 text-base sm:px-4 sm:text-lg' : 'text-xl'
          }`}
        >
          {large ? (
            <>
              Look up
              <EnterIcon className="text-base" />
            </>
          ) : (
            <SearchIcon />
          )}
        </button>
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-2 font-sans text-sm text-accent">
          {error}
        </p>
      )}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="animate-rise absolute left-0 right-0 top-full z-20 mt-2 min-w-56 border border-rule bg-paper py-1"
          style={{ animationDuration: '160ms' }}
        >
          {suggestions.map((word, index) => (
            <li
              key={word}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(word)}
              className={`cursor-pointer px-4 py-2 font-serif ${large ? 'text-lg' : 'text-base'} ${
                index === activeIndex ? 'bg-wash text-ink' : 'text-muted'
              }`}
            >
              {word}
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}
