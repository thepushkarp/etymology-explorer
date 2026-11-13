'use client'

import { useSyncExternalStore } from 'react'
import { entryPagePath, selectionFromLocation, type EntrySelection } from '../entrySelection'
import type { LanguageCode } from '../languages'

const EVENT = 'etymology-entry-selection'
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener)
  window.addEventListener(EVENT, listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener(EVENT, listener)
  }
}

export function navigateEntry(href: string) {
  if (href !== `${window.location.pathname}${window.location.search}`)
    window.history.pushState(null, '', href)
  window.dispatchEvent(new Event(EVENT))
}

/** Same-word navigation preserves live results while making selection shareable. */
export function useEntrySelection(
  word: string,
  language?: LanguageCode,
  initial: EntrySelection = {}
) {
  const href = useSyncExternalStore(
    subscribe,
    () => `${window.location.pathname}${window.location.search}`,
    () => entryPagePath(word, language, initial)
  )
  return selectionFromLocation(href, word) ?? { ...initial, language }
}
