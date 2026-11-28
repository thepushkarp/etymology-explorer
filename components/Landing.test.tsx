import { describe, expect, test } from 'bun:test'
import { DIE_FACES } from './Landing'

describe('Dice3D geometry', () => {
  test('forms a standard counterclockwise Western six-sided die with 1 on top, 3 in front, and 5 on the right', () => {
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
    // Top=1, Left=2, Front=3 runs counterclockwise; hover reveals Top=1, Front=3, Right=5
    expect(top).toBe(1)
    expect(left).toBe(2)
    expect(front).toBe(3)
    expect(right).toBe(5)
  })
})
