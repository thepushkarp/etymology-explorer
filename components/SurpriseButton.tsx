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
      const response = await fetch('/api/random-word')
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
        group
        relative
        inline-flex items-center gap-2
        px-6 py-3
        font-serif text-sm
        bg-white
        border border-charcoal/20
        rounded-full
        text-charcoal
        hover:border-charcoal/40 hover:shadow-sm
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-300
      "
    >
      {/* Animated sparkle effect on hover */}
      <span
        className="
        absolute inset-0
        rounded-full
        bg-gradient-to-r from-amber-50 via-cream to-amber-50
        opacity-0 group-hover:opacity-100
        transition-opacity duration-300
      "
      />

      {/* Icon */}
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

      {/* Text */}
      <span className="relative z-10 italic">{isLoading ? 'Finding a gem...' : 'Surprise me'}</span>

      {/* Decorative flourish */}
      <span
        className="
        relative z-10
        text-charcoal/30
        group-hover:text-charcoal/60
        transition-colors duration-300
      "
      >
        ✦
      </span>
    </button>
  )
}
