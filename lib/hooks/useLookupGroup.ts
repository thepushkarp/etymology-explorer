'use client'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { LookupGroup, WordEntry } from '../types'
import { lookupGroupForWord, lookupGroupSeed } from '../lookupGroups'
import { fetchLookupGroup } from '../traceLookupAlternatives'
import { lookupSession } from '../lookupSession'

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
  activity?: 'refresh' | 'trace'
}) {
  const key = lookup ?? word
  const snapshot = useSyncExternalStore(
    lookupSession.subscribe,
    lookupSession.getSnapshot,
    () => undefined
  )
  const active = lookupSession.matches(word, key) ? snapshot : undefined
  const [cached, setCached] = useState<{ key: string; group?: LookupGroup; error?: string }>()
  const hasSeed = useMemo(() => Boolean(entry && lookupGroupSeed(entry)), [entry])
  const eligible = Boolean(lookup || entry?.otherScripts?.length || hasSeed)
  const attached = Boolean(active)
  useEffect(() => {
    if (!eligible || !activity || attached) return
    if (activity === 'trace' && entry) {
      lookupSession.start(key, entry, initial)
      return
    }
    const run = new AbortController()
    void fetchLookupGroup(key, run.signal).then(
      (group) => {
        if (!run.signal.aborted) setCached({ key, group })
      },
      (error) => {
        if (!run.signal.aborted) {
          console.error('[Lookup navigation]', error)
          setCached({ key, error: 'Could not refresh related entries.' })
        }
      }
    )
    return () => run.abort()
  }, [key, eligible, activity, entry, initial, attached])
  const rawGroup = active?.group ?? (cached?.key === key ? cached.group : undefined) ?? initial
  const group = useMemo(() => lookupGroupForWord(word, rawGroup), [word, rawGroup])
  const retry = useCallback(() => {
    const source = active?.entry ?? entry
    if (source) lookupSession.start(active?.key ?? key, source, active?.group ?? initial, true)
  }, [active, entry, key, initial])
  return {
    group,
    preview: active?.preview,
    loading: active?.loading,
    status: active?.status,
    error: active?.error ?? (cached?.key === key ? cached.error : undefined),
    retry,
  }
}
