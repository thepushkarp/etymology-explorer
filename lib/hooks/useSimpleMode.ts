'use client'

import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'

const SIMPLE_MODE_STORAGE_KEY = 'simple-mode'

export function useSimpleMode() {
  const [isSimple, setIsSimple] = useLocalStorage<boolean>(SIMPLE_MODE_STORAGE_KEY, false)

  const toggleSimple = useCallback(() => {
    setIsSimple((prev) => !prev)
  }, [setIsSimple])

  return {
    isSimple,
    toggleSimple,
  }
}
