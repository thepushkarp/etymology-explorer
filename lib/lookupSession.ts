import type { LookupGroup, WordEntry } from './types'
import { lookupGroupForWord } from './lookupGroups'
import { traceLookupAlternatives, type LookupPreview } from './traceLookupAlternatives'

type Snapshot = {
  key: string
  entry: WordEntry
  group?: LookupGroup
  loading: boolean
  error?: string
  status?: string
  preview?: LookupPreview
}
// One explicit batch per browser tab. Route subscribers come and go independently of the work.
export function createLookupSession() {
  let state: Snapshot | undefined
  let controller: AbortController | undefined
  const listeners = new Set<() => void>()
  const set = (next?: Snapshot) => {
    state = next
    for (const listener of listeners) listener()
  }
  const stop = () => {
    controller?.abort()
    controller = undefined
    if (state) set()
  }
  const matches = (word: string, key?: string) =>
    Boolean(
      state &&
      (key === undefined || key === state.key || key === state.group?.reading) &&
      (word === state.key || word === state.entry.word || lookupGroupForWord(word, state.group))
    )
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    matches,
    stop,
    start(key: string, entry: WordEntry, initial?: LookupGroup, retry = false) {
      if (matches(entry.word, key) && (state?.loading || !retry)) return
      stop()
      const run = new AbortController()
      controller = run
      set({ key, entry, group: initial, loading: true })
      const update = (patch: Partial<Snapshot>) => {
        if (!run.signal.aborted && state) set({ ...state, ...patch })
      }
      void traceLookupAlternatives(
        key,
        entry,
        run.signal,
        (group) => update({ group }),
        (status, preview) => update({ status, preview })
      ).then(
        (error) => update({ loading: false, error, status: undefined, preview: undefined }),
        (error) => {
          if (!run.signal.aborted) {
            console.error('[Lookup navigation]', error)
            update({
              loading: false,
              error: 'Some related entries could not be loaded.',
              status: undefined,
              preview: undefined,
            })
          }
        }
      )
    },
  }
}
export const lookupSession = createLookupSession()
