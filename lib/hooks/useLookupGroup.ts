'use client'

import { useEffect, useState } from 'react'
import type { LookupGroup, WordEntry } from '../types'

/** Explicit lookup context travels with links; direct kanji URLs stay focused. */
export function useLookupGroup(
  word: string,
  initial?: LookupGroup,
  entry?: WordEntry,
  lookup?: string,
  refresh = false
) {
  const key = lookup ?? word
  const [loaded, setLoaded] = useState<{ key: string; group?: LookupGroup }>()
  const eligible = Boolean(
    lookup ||
    initial ||
    entry?.otherScripts?.length ||
    entry?.entries.ja?.histories.some((h) => h.counterparts?.length)
  )
  const group = eligible ? (loaded?.key === key ? loaded.group : initial) : undefined
  useEffect(() => {
    // SSR supplies the complete cache-only context. Only a completed live trace
    // can require newer navigation metadata; mounting a page does not refetch it.
    if (!refresh) return
    if (
      !lookup &&
      !entry?.otherScripts?.length &&
      !entry?.entries.ja?.histories.some((h) => h.counterparts?.length)
    )
      return
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(`/api/lookup-group?word=${encodeURIComponent(key)}`, {
          signal: controller.signal,
        })
        if (!response.ok)
          throw new Error(`Lookup navigation for “${key}” returned HTTP ${response.status}`)
        const data: { group: LookupGroup | null } = await response.json()
        if (controller.signal.aborted) return
        setLoaded({ key, group: data.group ?? undefined })
      } catch (error) {
        if (!controller.signal.aborted) console.error('[Lookup navigation]', error)
      }
    }
    void load()
    return () => controller.abort()
  }, [key, lookup, word, initial, entry, refresh])
  // Query parameters are navigation hints, never permission to join unrelated entries.
  return group && [...group.members, ...group.languages].some((target) => target.word === word)
    ? group
    : undefined
}
