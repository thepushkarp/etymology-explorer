'use client'

import { useState, useEffect, useCallback } from 'react'

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [storedValue, setStoredValue] = useState<T>(initialValue)
  const [isHydrated, setIsHydrated] = useState(false)

  // Load from localStorage on mount - intentional hydration pattern
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key)
      if (item) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStoredValue(JSON.parse(item))
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error)
    }

    setIsHydrated(true)
  }, [key])

  // Return a wrapped version of useState's setter
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        setStoredValue((prev) => {
          const valueToStore = value instanceof Function ? value(prev) : value
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(key, JSON.stringify(valueToStore))
          }
          return valueToStore
        })
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error)
      }
    },
    [key]
  )

  return [storedValue, setValue, isHydrated]
}
