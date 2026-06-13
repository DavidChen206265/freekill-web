import { describe, expect, it } from 'vitest'
import { computeHandDropIndex, dragMoved } from '../src/table/cardDrag.js'

describe('N1-4 card drag helpers', () => {
  it('uses the same movement threshold for click-vs-drag separation', () => {
    expect(dragMoved(10, 10, 13, 13)).toBe(false)
    expect(dragMoved(10, 10, 14, 13)).toBe(true)
  })

  it('computes a hand reorder insertion index from the drop center', () => {
    const centers = new Map([[1, 100], [2, 180], [3, 260]])
    expect(computeHandDropIndex([1, 2, 3], 3, 80, (cid) => centers.get(cid))).toBe(0)
    expect(computeHandDropIndex([1, 2, 3], 3, 220, (cid) => centers.get(cid))).toBe(2)
    expect(computeHandDropIndex([1, 2, 3], 1, 999, (cid) => centers.get(cid))).toBe(2)
  })
})
