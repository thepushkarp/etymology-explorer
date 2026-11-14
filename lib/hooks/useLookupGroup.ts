'use client'

import { useEffect, useState } from 'react'
import type { LookupGroup, WordEntry } from '../types'
import { lookupGroupForWord, lookupGroupSeed } from '../lookupGroups'
import { fetchLookupGroup, traceLookupAlternatives } from '../traceLookupAlternatives'

/** Explicit lookup context travels with links; direct kanji URLs stay focused. */
export function useLookupGroup({
  word,
  initial,
  entry,
  lookup,
  activity,
}: {
  word: string
  initial?: LookupGroup
  entry?: WordEntry
  lookup?: string
  /** Only explicit search intent may request research; refresh reads cached navigation. */
  activity?: 'refresh' | 'trace'
}) {
  const key = lookup ?? word
  const [loaded, setLoaded] = useState<{ key: string; group?: LookupGroup }>()
  const [status, setStatus] = useState<{ key: string; loading: boolean; error?: string }>()
  const [retry, setRetry] = useState(0)
  const hasLinks = Boolean(entry?.otherScripts?.length || (entry && lookupGroupSeed(entry)))
  const eligible = Boolean(lookup || initial || hasLinks)
  const group = eligible ? (loaded?.key === key ? loaded.group : initial) : undefined
  useEffect(() => {
    if (!activity && !retry) return
    if (!lookup && !hasLinks) return
    const controller = new AbortController()
    const publish = (group: LookupGroup | undefined) => setLoaded({ key, group })
    async function load() {
      try {
        if ((activity === 'trace' || retry) && entry) {
          setStatus({ key, loading: true })
          const error = await traceLookupAlternatives(key, entry, controller.signal, publish)
          setStatus({ key, loading: false, error })
        } else {
          publish(await fetchLookupGroup(key, controller.signal))
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('[Lookup navigation]', error)
          setStatus({ key, loading: false, error: 'Some related entries could not be loaded.' })
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [key, lookup, entry, activity, retry, hasLinks])
  return {
    group: lookupGroupForWord(word, group),
    loading: Boolean((activity === 'trace' || retry) && status?.key === key && status.loading),
    error: status?.key === key ? status.error : undefined,
    retry: () => setRetry((value) => value + 1),
  }
}
