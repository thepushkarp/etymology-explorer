'use client'

import { useState, useRef, useEffect, useSyncExternalStore } from 'react'
import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { useTheme, type Theme, type DarkPalette } from '@/lib/hooks/useTheme'

const themeConfig: Record<Theme, { label: string; next: Theme }> = {
  light: { label: 'Light', next: 'dark' },
  dark: { label: 'Dark', next: 'system' },
  system: { label: 'Auto', next: 'light' },
}

const themeIcon = {
  light: SunIcon,
  dark: MoonIcon,
  system: ComputerDesktopIcon,
} as const

const paletteConfig: { id: DarkPalette; label: string; swatch: string }[] = [
  { id: 'warm', label: 'Warm', swatch: 'bg-[#252220]' },
  { id: 'slate', label: 'Slate', swatch: 'bg-[#1f2229]' },
  { id: 'neutral', label: 'Neutral', swatch: 'bg-[#1f1f1f]' },
]

export default function ThemeToggle() {
  const { theme, resolvedTheme, darkPalette, setTheme, setDarkPalette } = useTheme()
  const [showPalettes, setShowPalettes] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  // Close palette picker on outside click
  useEffect(() => {
    if (!showPalettes) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPalettes(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showPalettes])

  if (!hydrated) {
    return (
      <button
        aria-label="Theme selector"
        className="inline-flex items-center gap-2.5 rounded-full border border-charcoal/25 bg-surface px-4 py-2
        text-sm font-semibold text-charcoal shadow-sm"
      >
        <ComputerDesktopIcon className="h-4 w-4" />
        <span>Auto</span>
      </button>
    )
  }

  const current = themeConfig[theme]
  const next = themeConfig[current.next]
  const Icon = themeIcon[theme]
  const isDark = resolvedTheme === 'dark'

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-2">
      {/* Main theme toggle */}
      <button
        onClick={() => setTheme(current.next)}
        aria-label={`Theme: ${current.label}. Click to switch to ${next.label}`}
        title={`Theme: ${current.label} (next: ${next.label})`}
        className="inline-flex items-center gap-2.5 rounded-full border border-charcoal/25 bg-surface px-4 py-2
        text-sm font-semibold text-charcoal shadow-sm transition-colors duration-200
        hover:bg-cream-dark/60 hover:border-charcoal/45"
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
        <span>{current.label}</span>
      </button>

      {/* Palette picker — only visible in dark mode */}
      {isDark && (
        <button
          onClick={() => setShowPalettes((prev) => !prev)}
          aria-label="Change dark mode palette"
          title="Dark mode palette"
          className="inline-flex items-center gap-1.5 rounded-full border border-charcoal/25 bg-surface px-3 py-2
          text-xs font-semibold text-charcoal shadow-sm transition-colors duration-200
          hover:bg-cream-dark/60 hover:border-charcoal/45"
        >
          <span
            className={`w-3 h-3 rounded-full border border-charcoal/30 ${paletteConfig.find((p) => p.id === darkPalette)?.swatch ?? ''}`}
          />
          <svg
            className="w-3 h-3 text-charcoal/60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={showPalettes ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
            />
          </svg>
        </button>
      )}

      {/* Palette dropdown */}
      {showPalettes && isDark && (
        <div
          className="
            absolute top-full right-0 mt-2
            bg-surface border border-charcoal/15
            rounded-lg shadow-md
            p-2 z-50
            min-w-[140px]
            animate-fadeIn
          "
        >
          <p className="text-[10px] uppercase tracking-widest text-charcoal-light/70 px-2 pb-1.5 mb-1 border-b border-charcoal/10">
            Dark palette
          </p>
          {paletteConfig.map((palette) => (
            <button
              key={palette.id}
              onClick={() => {
                setDarkPalette(palette.id)
                setShowPalettes(false)
              }}
              className={`
                w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md
                text-sm font-serif text-charcoal
                transition-colors duration-150
                ${darkPalette === palette.id ? 'bg-charcoal/10' : 'hover:bg-charcoal/5'}
              `}
            >
              <span
                className={`w-4 h-4 rounded-full border border-charcoal/30 ${palette.swatch}`}
              />
              <span>{palette.label}</span>
              {darkPalette === palette.id && (
                <svg
                  className="w-3.5 h-3.5 ml-auto text-accent-soft"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
