// gameStore backToRoom tests — returning to the waiting room after GameOver must
// strip last game's per-player state (general/hp/role/marks/dead) but keep the
// waiting-room identity (name/avatar/seat/owner/ready). Regression for "previous
// game's state lingers after going back to the room".

import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '../src/stores/gameStore.js'

beforeEach(() => useGameStore.getState().resetGame())

describe('gameStore.backToRoom', () => {
  it('strips per-game player state but keeps waiting-room identity', () => {
    const g = useGameStore.getState()
    // Seed a finished-game roster with rich per-game state.
    g.syncPlayers([
      { id: 1, name: 'alice', avatar: 'a1', seat: 1, owner: true, ready: true, general: 'caocao', hp: 2, maxHp: 4, role: 'lord', dead: false, marks: [{ name: '@x', value: '3' }] },
      { id: 2, name: 'bob', avatar: 'a2', seat: 2, owner: false, ready: true, general: 'liubei', hp: 0, maxHp: 4, role: 'rebel', dead: true },
    ], true)
    expect(useGameStore.getState().players[1]!.general).toBe('caocao')
    expect(useGameStore.getState().started).toBe(true)

    g.backToRoom(2)
    const s = useGameStore.getState()
    expect(s.started).toBe(false)
    expect(s.winner).toBeUndefined()
    expect(s.capacity).toBe(2)
    // identity kept
    expect(s.players[1]!.name).toBe('alice')
    expect(s.players[1]!.avatar).toBe('a1')
    expect(s.players[1]!.seat).toBe(1)
    expect(s.players[1]!.owner).toBe(true)
    expect(s.players[1]!.ready).toBe(true)
    // per-game state stripped
    expect(s.players[1]!.general).toBeUndefined()
    expect(s.players[1]!.hp).toBeUndefined()
    expect(s.players[1]!.role).toBeUndefined()
    expect(s.players[1]!.displayMarks ?? []).toEqual([])
    expect(s.players[2]!.dead).toBeUndefined()
    expect(s.players[2]!.general).toBeUndefined()
  })
})

describe('gameStore.setMarkAreaVisible', () => {
  it('preserves the visibility delta across VM player mirror syncs', () => {
    const g = useGameStore.getState()
    g.syncPlayers([{ id: 1, name: 'alice', avatar: 'a1', marks: [{ name: '@x', value: '1' }] }], true)
    g.setMarkAreaVisible(1, false)
    expect(useGameStore.getState().players[1]!.markAreaVisible).toBe(false)

    g.syncPlayers([{ id: 1, name: 'alice', avatar: 'a1', marks: [{ name: '@x', value: '2' }] }], true)
    const p = useGameStore.getState().players[1]!
    expect(p.markAreaVisible).toBe(false)
    expect(p.displayMarks).toEqual([{ name: '@x', value: '2' }])
  })
})
