'use client'

import { useLocalStorage } from './useLocalStorage'
import { HistoryEntry } from '../types'
import { useCallback } from 'react'

const MAX_HISTORY_SIZE = 50

export function useHistory() {
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>('etymology-history', [])

  const addToHistory = useCallback(
    (word: string) => {
      setHistory((prev) => {
        // Remove if already exists (we'll add to front)
        const filtered = prev.filter((entry) => entry.word !== word.toLowerCase())

        // Add to front
        const newEntry: HistoryEntry = {
          word: word.toLowerCase(),
          timestamp: Date.now(),
        }

        // Keep max size
        return [newEntry, ...filtered].slice(0, MAX_HISTORY_SIZE)
      })
    },
    [setHistory]
  )

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [setHistory])

  const removeFromHistory = useCallback(
    (word: string) => {
      setHistory((prev) => prev.filter((entry) => entry.word !== word.toLowerCase()))
    },
    [setHistory]
  )

  return {
    history,
    addToHistory,
    clearHistory,
    removeFromHistory,
  }
}
