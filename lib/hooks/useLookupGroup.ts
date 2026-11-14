'use client'

import { useEffect, useState } from 'react'
import type { LookupGroup, WordEntry } from '../types'
import { lookupGroupSeed } from '../lookupGroups'
import { traceLookupAlternatives } from '../traceLookupAlternatives'

/** Explicit lookup context travels with links; direct kanji URLs stay focused. */
export function useLookupGroup(
  word: string,
  initial?: LookupGroup,
  entry?: WordEntry,
  lookup?: string,
  refresh = false,
  traceAlternatives = false
) {
  const key = lookup ?? word
  const [loaded, setLoaded] = useState<{ key: string; group?: LookupGroup }>()
  const [status, setStatus] = useState<{ key: string; loading: boolean; error?: string }>()
  const [retry, setRetry] = useState(0)
  const hasLinks = Boolean(entry?.otherScripts?.length || (entry && lookupGroupSeed(entry)))
  const eligible = Boolean(lookup || initial || hasLinks)
  const group = eligible ? (loaded?.key === key ? loaded.group : initial) : undefined
  useEffect(() => {
    if (!refresh && !traceAlternatives && !retry) return
    if (!lookup && !hasLinks) return
    const controller = new AbortController()
    const publish = (group: LookupGroup | undefined) => setLoaded({ key, group })
    async function load() {
      try {
        if ((traceAlternatives || retry) && entry) {
          setStatus({ key, loading: true })
          const error = await traceLookupAlternatives(key, entry, controller.signal, publish)
          setStatus({ key, loading: false, error })
        } else {
          const response = await fetch(`/api/lookup-group?word=${encodeURIComponent(key)}`, {
            signal: controller.signal,
          })
          if (!response.ok)
            throw new Error(`Lookup navigation for “${key}” returned HTTP ${response.status}`)
          const data: { group: LookupGroup | null } = await response.json()
          controller.signal.throwIfAborted()
          publish(data.group ?? undefined)
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
  }, [key, lookup, entry, refresh, traceAlternatives, retry, hasLinks])
  // Query parameters are navigation hints, never permission to join unrelated entries.
  return {
    group:
      group && [...group.members, ...group.languages].some((target) => target.word === word)
        ? group
        : undefined,
    loading: Boolean((traceAlternatives || retry) && status?.key === key && status.loading),
    error: status?.key === key ? status.error : undefined,
    retry: () => setRetry((value) => value + 1),
  }
}
