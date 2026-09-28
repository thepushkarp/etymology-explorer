'use client'

import { useId, useRef, useState } from 'react'
import { SearchIcon } from '@/components/Icons'
import { useHotkey } from '@/lib/hooks/useHotkey'
import { useSuggestions } from '@/lib/hooks/useSuggestions'
import { useWordNavigation } from '@/lib/hooks/useWordNavigation'
import type { LanguageCode } from '@/lib/languages'

interface SearchBoxProps {
  language: LanguageCode
  size?: 'large' | 'compact'
  autoFocus?: boolean
}

/**
 * Word search with wordlist suggestions. Enter (or picking a suggestion)
 * navigates straight to the word page; `/` focuses the field from anywhere.
 */
export function SearchBox({ language, size = 'compact', autoFocus = false }: SearchBoxProps) {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const navigateToWord = useWordNavigation()
  const suggestions = useSuggestions(value, language)
  const showList = open && suggestions.length > 0
  const activeIndex = active < suggestions.length ? active : -1

  useHotkey('/', () => inputRef.current?.focus())

  const go = (word: string) => {
    const trimmed = word.trim()
    if (!trimmed) return
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
    } else if (event.key === 'Escape') {
      if (showList) setOpen(false)
      else inputRef.current?.blur()
    }
  }

  const large = size === 'large'

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(event) => {
        event.preventDefault()
        go(activeIndex >= 0 ? suggestions[activeIndex] : value)
      }}
    >
      <div
        className={`flex items-center gap-3 border-b transition-colors duration-200 focus-within:border-ink ${
          large ? 'border-rule pb-3' : 'border-transparent pb-1'
        }`}
      >
        <SearchIcon className={`shrink-0 text-muted ${large ? 'text-2xl' : 'text-base'}`} />
        <input
          ref={inputRef}
          type="search"
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => {
            setValue(event.target.value)
            setActive(-1)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={large ? 'Type a word' : 'Search a word'}
          aria-label="Search a word"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          className={`min-w-0 flex-1 bg-transparent font-serif text-ink outline-none placeholder:text-muted placeholder:italic [&::-webkit-search-cancel-button]:hidden ${
            large ? 'text-2xl sm:text-3xl' : 'text-base'
          }`}
        />
        {!large && (
          <kbd className="hidden rounded border border-rule px-1.5 text-xs text-muted sm:block">
            /
          </kbd>
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="animate-rise absolute left-0 right-0 top-full z-20 mt-2 min-w-56 border border-rule bg-paper py-1 shadow-[0_12px_32px_-16px_rgb(0_0_0/0.25)]"
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
