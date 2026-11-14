'use client'

import { useSyncExternalStore } from 'react'
import { isLanguageCode, type LanguageCode } from '@/lib/languages'

const STORAGE_KEY = 'etymology-search-language'
const listeners = new Set<() => void>()
let language: LanguageCode | undefined
let initialized = false

function getSnapshot(): LanguageCode | undefined {
  if (!initialized) {
    initialized = true
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      language = saved && isLanguageCode(saved) ? saved : undefined
    } catch (error) {
      console.warn('[SearchLanguage] Cannot restore this tab’s search preference:', error)
    }
  }
  return language
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setLanguage(value?: LanguageCode) {
  initialized = true
  language = value
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, value)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    // Keep the in-memory preference usable when browser storage is blocked.
    console.warn('[SearchLanguage] Cannot save this tab’s search preference:', error)
  }
  for (const listener of listeners) listener()
}

const serverSnapshot = () => undefined

/** Only explicit selector changes update this tab's preference, never result navigation. */
export function useSearchLanguage() {
  return [useSyncExternalStore(subscribe, getSnapshot, serverSnapshot), setLanguage] as const
}
