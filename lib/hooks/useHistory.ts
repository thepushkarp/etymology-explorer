'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { HistoryEntry } from '@/lib/types'

const HISTORY_STORAGE_KEY = 'etymology-history'
const MAX_HISTORY_SIZE = 50
const EMPTY_HISTORY: HistoryEntry[] = []

type HistoryListener = () => void

const listeners = new Set<HistoryListener>()
let historySnapshot: HistoryEntry[] = EMPTY_HISTORY
let isInitialized = false
let isStorageListenerAttached = false

function canUseDOM(): boolean {
  return typeof window !== 'undefined'
}

function parseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return EMPTY_HISTORY

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return EMPTY_HISTORY

    return parsed.filter(
      (entry): entry is HistoryEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as HistoryEntry).word === 'string' &&
        typeof (entry as HistoryEntry).timestamp === 'number'
    )
  } catch (error) {
    console.error(`Error reading localStorage key "${HISTORY_STORAGE_KEY}":`, error)
    return EMPTY_HISTORY
  }
}

function readHistoryFromStorage(): HistoryEntry[] {
  if (!canUseDOM()) return EMPTY_HISTORY
  return parseHistory(window.localStorage.getItem(HISTORY_STORAGE_KEY))
}

function ensureHistorySnapshot(): HistoryEntry[] {
  if (!isInitialized) {
    historySnapshot = readHistoryFromStorage()
    isInitialized = true
  }

  return historySnapshot
}

function emitHistoryChange(): void {
  listeners.forEach((listener) => listener())
}

function writeHistory(nextHistory: HistoryEntry[]): void {
  historySnapshot = nextHistory
  isInitialized = true

  if (canUseDOM()) {
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory))
    } catch (error) {
      console.error(`Error setting localStorage key "${HISTORY_STORAGE_KEY}":`, error)
    }
  }

  emitHistoryChange()
}

function handleStorage(event: StorageEvent): void {
  if (event.key !== HISTORY_STORAGE_KEY) return

  historySnapshot = readHistoryFromStorage()
  isInitialized = true
  emitHistoryChange()
}

function subscribe(listener: HistoryListener): () => void {
  listeners.add(listener)

  if (canUseDOM() && !isStorageListenerAttached) {
    window.addEventListener('storage', handleStorage)
    isStorageListenerAttached = true
  }

  return () => {
    listeners.delete(listener)

    if (canUseDOM() && listeners.size === 0 && isStorageListenerAttached) {
      window.removeEventListener('storage', handleStorage)
      isStorageListenerAttached = false
    }
  }
}

function getSnapshot(): HistoryEntry[] {
  return ensureHistorySnapshot()
}

export function useHistory() {
  const history = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_HISTORY)

  const addToHistory = useCallback((word: string) => {
    const normalizedWord = word.toLowerCase()
    const nextHistory = [
      { word: normalizedWord, timestamp: Date.now() },
      ...ensureHistorySnapshot().filter((entry) => entry.word !== normalizedWord),
    ].slice(0, MAX_HISTORY_SIZE)

    writeHistory(nextHistory)
  }, [])

  const clearHistory = useCallback(() => {
    writeHistory(EMPTY_HISTORY)
  }, [])

  const removeFromHistory = useCallback((word: string) => {
    const normalizedWord = word.toLowerCase()
    const nextHistory = ensureHistorySnapshot().filter((entry) => entry.word !== normalizedWord)

    writeHistory(nextHistory)
  }, [])

  return {
    history,
    addToHistory,
    clearHistory,
    removeFromHistory,
  }
}
