// seatLayout + gameStore unit tests (pure logic, no DOM).

import { describe, it, expect } from 'vitest'
import { seatPosition, toRelativeSeat, DEFAULT_STAGE } from '../src/table/seatLayout.js'
import { useGameStore } from '../src/stores/gameStore.js'

describe('seatLayout', () => {
  it('places self (relativeSeat 0) at the bottom region', () => {
    const pos = seatPosition(0, 8)
    // region[0].y = sceneHeight - 192 = 540 - 192 = 348 (bottom area)
    expect(pos.y).toBe(DEFAULT_STAGE.sceneHeight - 192)
  })

  it('gives distinct positions for each seat in an 8-player game', () => {
    const xs = new Set<string>()
    for (let s = 0; s < 8; s++) {
      const p = seatPosition(s, 8)
      xs.add(`${Math.round(p.x)},${Math.round(p.y)}`)
    }
    expect(xs.size).toBe(8)
  })

  it('toRelativeSeat: self maps to 0, wraps clockwise', () => {
    expect(toRelativeSeat(3, 3, 4)).toBe(0) // self
    expect(toRelativeSeat(4, 3, 4)).toBe(1) // next
    expect(toRelativeSeat(2, 3, 4)).toBe(3) // prev (wraps)
  })
})

describe('gameStore reducer', () => {
  it('applies AddPlayer / ArrangeSeats / PropertyUpdate from array deltas', () => {
    const { apply, resetGame } = useGameStore.getState()
    resetGame()
    apply('AddPlayer', [1, 'Alice', 'caocao', false, 0])
    apply('AddPlayer', [2, 'Bob', 'liubei', false, 0])
    apply('ArrangeSeats', [1, 2])
    apply('PropertyUpdate', [1, 'hp', 4])
    apply('PropertyUpdate', [1, 'general', 'caocao'])
    apply('PropertyUpdate', [1, 'role', 'lord'])
    apply('StartGame', [])

    const s = useGameStore.getState()
    expect(Object.keys(s.players)).toHaveLength(2)
    expect(s.players[1]!.name).toBe('Alice')
    expect(s.players[1]!.seat).toBe(1)
    expect(s.players[2]!.seat).toBe(2)
    expect(s.players[1]!.hp).toBe(4)
    expect(s.players[1]!.general).toBe('caocao')
    expect(s.players[1]!.role).toBe('lord')
    expect(s.started).toBe(true)
    expect(s.seatOrder).toEqual([1, 2])
  })

  it('RemovePlayer drops the player and seat', () => {
    const { apply, resetGame } = useGameStore.getState()
    resetGame()
    apply('AddPlayer', [1, 'A', 'x', false, 0])
    apply('AddPlayer', [2, 'B', 'y', false, 0])
    apply('ArrangeSeats', [1, 2])
    apply('RemovePlayer', [2])
    const s = useGameStore.getState()
    expect(s.players[2]).toBeUndefined()
    expect(s.seatOrder).toEqual([1])
  })

  it('SetPlayerMark accumulates marks', () => {
    const { apply, resetGame } = useGameStore.getState()
    resetGame()
    apply('AddPlayer', [1, 'A', 'x', false, 0])
    apply('SetPlayerMark', [1, '@test', 3])
    expect(useGameStore.getState().players[1]!.marks['@test']).toBe(3)
  })
})
