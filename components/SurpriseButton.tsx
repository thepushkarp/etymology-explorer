'use client'

import { useState } from 'react'

interface SurpriseButtonProps {
  onWordSelected: (word: string) => void
  disabled?: boolean
}

export function SurpriseButton({ onWordSelected, disabled }: SurpriseButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    if (isLoading || disabled) return

    setIsLoading(true)
    try {
      const response = await fetch('/api/random-word', { cache: 'no-store' })
      const data = await response.json()

      if (data.success && data.data?.word) {
        onWordSelected(data.data.word)
      }
    } catch (error) {
      console.error('Failed to fetch random word:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading || disabled}
      className="
        group relative inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface/92
        px-5 py-2.5 font-serif text-sm text-charcoal shadow-sm transition-all duration-300
        hover:-translate-y-px hover:border-border-strong
        hover:shadow-[0_18px_44px_-28px_var(--shadow-color)]
        disabled:opacity-50 disabled:cursor-not-allowed
      "
    >
      <span
        className="
        absolute inset-0 rounded-full
        bg-gradient-to-r from-transparent via-cream-dark/70 to-transparent
        opacity-0 group-hover:opacity-100
        transition-opacity duration-300
      "
      />

      <span className="relative z-10">
        {isLoading ? (
          <svg
            className="w-5 h-5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.8" />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 group-hover:rotate-12 transition-transform duration-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            {/* Dice icon */}
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <circle cx="8" cy="8" r="1" fill="currentColor" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
            <circle cx="16" cy="16" r="1" fill="currentColor" />
          </svg>
        )}
      </span>

      <span className="relative z-10 italic">{isLoading ? 'Finding a gem...' : 'Surprise me'}</span>
    </button>
  )
}
