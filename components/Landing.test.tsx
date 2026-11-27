import { describe, expect, test } from 'bun:test'
import { DIE_FACES } from './Landing'

describe('Dice3D geometry', () => {
  test('forms a standard counterclockwise Western six-sided die with 1 on top, 2 in front, and 3 on the right', () => {
    expect(DIE_FACES).toHaveLength(6)
    const count = (transform: string) => {
      const face = DIE_FACES.find((item) => item.transform === transform)
      expect(face).toBeDefined()
      return face!.pips.length
    }

    const front = count('translateZ(8px)')
    const back = count('rotateY(180deg) translateZ(8px)')
    const right = count('rotateY(90deg) translateZ(8px)')
    const left = count('rotateY(-90deg) translateZ(8px)')
    const top = count('rotateX(90deg) translateZ(8px)')
    const bottom = count('rotateX(-90deg) translateZ(8px)')

    // All six face values 1..6 present once
    expect([front, back, right, left, top, bottom].sort()).toEqual([1, 2, 3, 4, 5, 6])
    // Opposite faces sum to 7
    expect(front + back).toBe(7)
    expect(right + left).toBe(7)
    expect(top + bottom).toBe(7)
    // Hover reveals Top=1, Front=2, Right=3 (1 -> 2 -> 3 counterclockwise)
    expect(top).toBe(1)
    expect(front).toBe(2)
    expect(right).toBe(3)
  })
})
