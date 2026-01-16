'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

interface SearchBarProps {
  onSearch: (word: string) => void
  isLoading?: boolean
  initialValue?: string
}

export function SearchBar({ onSearch, isLoading, initialValue = '' }: SearchBarProps) {
  const [value, setValue] = useState(initialValue)
  const [isFocused, setIsFocused] = useState(false)
  const searchParams = useSearchParams()

  // Sync with URL on mount - intentional URL → state sync pattern
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && q !== value) {
      setValue(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = value.trim()
      if (trimmed && !isLoading) {
        onSearch(trimmed)
      }
    },
    [value, isLoading, onSearch]
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
            border border-charcoal/10
            transition-all duration-500
            ${isFocused ? 'border-charcoal/30 -inset-4' : ''}
          `}
        />

        {/* Decorative corners */}
        <div className="absolute -top-3 -left-3 w-6 h-6 border-l-2 border-t-2 border-charcoal/20 rounded-tl-lg" />
        <div className="absolute -top-3 -right-3 w-6 h-6 border-r-2 border-t-2 border-charcoal/20 rounded-tr-lg" />
        <div className="absolute -bottom-3 -left-3 w-6 h-6 border-l-2 border-b-2 border-charcoal/20 rounded-bl-lg" />
        <div className="absolute -bottom-3 -right-3 w-6 h-6 border-r-2 border-b-2 border-charcoal/20 rounded-br-lg" />

        {/* Main input container */}
        <div className="relative bg-white rounded-lg shadow-sm overflow-hidden">
          {/* Subtle paper texture overlay */}
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            }}
          />

          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Enter a word to explore its roots..."
            disabled={isLoading}
            className="
              w-full px-8 py-5 text-xl
              bg-transparent
              border-none outline-none
              font-serif text-charcoal
              placeholder:text-charcoal-light/40
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
              h-px bg-gradient-to-r from-transparent via-charcoal/40 to-transparent
              transition-all duration-500 ease-out
              ${isFocused ? 'w-[90%]' : 'w-0'}
            `}
          />
        </div>

        {/* Search button */}
        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="
            absolute right-4 top-1/2 -translate-y-1/2
            p-3 rounded-full
            text-charcoal-light
            hover:text-charcoal hover:bg-cream-dark/50
            transition-all duration-300
            disabled:opacity-30 disabled:cursor-not-allowed
            disabled:hover:bg-transparent
          "
          aria-label="Search"
        >
          {isLoading ? <LoadingSpinner /> : <SearchIcon />}
        </button>
      </div>
    </form>
  )
}

function SearchIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform group-hover:scale-110"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
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
