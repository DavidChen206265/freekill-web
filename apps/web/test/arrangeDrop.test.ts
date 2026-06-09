// arrangeDrop reducer tests (M4 I-6 real drag). Covers move between areas, intra-
// area reorder (Guanxing top-of-pile ordering matters), over-capacity bump, and
// the [limit,capacity] validity gate. The reply is slots-in-order: [[cids]].

import { describe, it, expect } from 'vitest'
import { arrangeDrop, arrangeValid, type ArrangeState } from '../src/table/arrangeDrop.js'

const init = (): ArrangeState => ({ slots: [[], []], tray: [1, 2, 3] })

describe('arrangeDrop', () => {
  it('moves a tray card into an area at the given index', () => {
    const s = arrangeDrop(init(), [3, 3], 1, 0, 0)
    expect(s.slots[0]).toEqual([1])
    expect(s.tray).toEqual([2, 3])
  })

  it('inserts at the requested index, preserving order (Guanxing top sequence)', () => {
    let s = arrangeDrop(init(), [3, 3], 1, 0, 0) // [1]
    s = arrangeDrop(s, [3, 3], 2, 0, 0)          // insert 2 before 1 → [2,1]
    s = arrangeDrop(s, [3, 3], 3, 0, 1)          // insert 3 at idx1 → [2,3,1]
    expect(s.slots[0]).toEqual([2, 3, 1])
    expect(s.tray).toEqual([])
  })

  it('reorders within an area when re-dropping an already-placed card', () => {
    let s = arrangeDrop(init(), [3, 3], 1, 0, 0)
    s = arrangeDrop(s, [3, 3], 2, 0, 1) // [1,2]
    s = arrangeDrop(s, [3, 3], 1, 0, 2) // move 1 to end → [2,1]
    expect(s.slots[0]).toEqual([2, 1])
  })

  it('moves a card from one area to another', () => {
    let s = arrangeDrop(init(), [3, 3], 1, 0, 0)
    s = arrangeDrop(s, [3, 3], 1, 1, 0) // 1 moves from area0 to area1
    expect(s.slots[0]).toEqual([])
    expect(s.slots[1]).toEqual([1])
  })

  it('bumps the oldest card back to tray when an area overflows capacity', () => {
    let s = arrangeDrop(init(), [1, 3], 1, 0, 0) // area0 cap 1 → [1]
    s = arrangeDrop(s, [1, 3], 2, 0, 1)          // drop 2 → [1,2] over cap → bump 1
    expect(s.slots[0]).toEqual([2])
    expect(s.tray).toContain(1)
  })

  it('ai<0 returns a card to the tray', () => {
    let s = arrangeDrop(init(), [3, 3], 1, 0, 0)
    s = arrangeDrop(s, [3, 3], 1, -1, 0)
    expect(s.slots[0]).toEqual([])
    expect(s.tray).toContain(1)
  })

  it('arrangeValid requires all placed and each area within [limit,capacity]', () => {
    let s = arrangeDrop(init(), [2, 1], 1, 0, 0)
    s = arrangeDrop(s, [2, 1], 2, 0, 1) // area0 [1,2]
    s = arrangeDrop(s, [2, 1], 3, 1, 0) // area1 [3]
    expect(arrangeValid(s, [2, 1], [0, 1])).toBe(true)
    // a leftover tray card → invalid
    const s2 = arrangeDrop(init(), [2, 1], 1, 0, 0)
    expect(arrangeValid(s2, [2, 1], [0, 1])).toBe(false)
    // area below its limit → invalid
    const s3: ArrangeState = { slots: [[1, 2, 3], []], tray: [] }
    expect(arrangeValid(s3, [3, 1], [0, 1])).toBe(false)
  })
})
