'use client'

import { useState, useEffect, useCallback } from 'react'

export type Theme = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'
export type DarkPalette = 'warm' | 'slate' | 'neutral'

const STORAGE_KEY = 'theme-preference'
const PALETTE_KEY = 'dark-palette'

const PALETTE_CLASSES: DarkPalette[] = ['warm', 'slate', 'neutral']

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(resolved: ResolvedTheme, palette: DarkPalette) {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
    // Remove all palette classes, then add the active one
    PALETTE_CLASSES.forEach((p) => root.classList.remove(`dark-${p}`))
    root.classList.add(`dark-${palette}`)
  } else {
    root.classList.remove('dark')
    PALETTE_CLASSES.forEach((p) => root.classList.remove(`dark-${p}`))
  }
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'system'
}

function getInitialPalette(): DarkPalette {
  if (typeof window === 'undefined') return 'warm'
  const stored = localStorage.getItem(PALETTE_KEY)
  if (stored === 'warm' || stored === 'slate' || stored === 'neutral') {
    return stored
  }
  return 'warm'
}

function getInitialResolved(theme: Theme): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return theme === 'system' ? getSystemTheme() : theme
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  const [darkPalette, setDarkPaletteState] = useState<DarkPalette>(getInitialPalette)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    getInitialResolved(getInitialTheme())
  )

  useEffect(() => {
    applyTheme(resolvedTheme, darkPalette)
  }, [resolvedTheme, darkPalette])

  // Listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (theme === 'system') {
        setResolvedTheme(getSystemTheme())
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
    setResolvedTheme(newTheme === 'system' ? getSystemTheme() : newTheme)
  }, [])

  const setDarkPalette = useCallback((palette: DarkPalette) => {
    setDarkPaletteState(palette)
    localStorage.setItem(PALETTE_KEY, palette)
  }, [])

  return { theme, resolvedTheme, darkPalette, setTheme, setDarkPalette }
}
