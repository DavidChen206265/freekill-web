// seatLayout + gameStore unit tests (pure logic, no DOM).

import { describe, it, expect } from 'vitest'
import { seatPosition, DEFAULT_STAGE } from '../src/table/seatLayout.js'
import { useGameStore } from '../src/stores/gameStore.js'

describe('seatLayout', () => {
  it('places display index 0 (self) at the bottom region', () => {
    const pos = seatPosition(0, 8)
    // region[0].y = sceneHeight - 192 = 540 - 192 = 348 (bottom)
    expect(pos.y).toBe(DEFAULT_STAGE.sceneHeight - 192)
  })

  it('gives distinct positions for each display slot in an 8-player game', () => {
    const xs = new Set<string>()
    for (let i = 0; i < 8; i++) {
      const p = seatPosition(i, 8)
      xs.add(`${Math.round(p.x)},${Math.round(p.y)}`)
    }
    expect(xs.size).toBe(8)
  })

  it('2-player: index 0 at bottom, index 1 across (region slot 4)', () => {
    // regularSeatIndex[1] = [0, 4]; slot 4 is top-center.
    const p0 = seatPosition(0, 2)
    const p1 = seatPosition(1, 2)
    expect(p0.y).toBe(DEFAULT_STAGE.sceneHeight - 192) // bottom
    expect(p1.y).toBe(16) // roomAreaPadding — top row
  })

  it('>8 players: uses arrangeManyPhotos with scale < 1, distinct slots', () => {
    const n = 10
    const self = seatPosition(0, n)
    expect(self.y).toBe(DEFAULT_STAGE.sceneHeight - 192) // self still bottom
    expect(self.scale).toBeLessThan(1) // photos shrink to fit
    const xs = new Set<string>()
    for (let i = 0; i < n; i++) {
      const p = seatPosition(i, n)
      xs.add(`${Math.round(p.x)},${Math.round(p.y)}`)
    }
    expect(xs.size).toBe(n) // all distinct
  })
})

describe('gameStore reducer', () => {
  it('roster comes from syncPlayers (VM mirror); props carried through', () => {
    const { syncPlayers, resetGame } = useGameStore.getState()
    resetGame()
    syncPlayers([
      { id: 1, name: 'Alice', avatar: 'caocao', seat: 1, hp: 4, maxHp: 4, general: 'caocao', role: 'lord', isSelf: true },
      { id: 2, name: 'Bob', avatar: 'liubei', seat: 2 },
    ])
    const s = useGameStore.getState()
    expect(Object.keys(s.players)).toHaveLength(2)
    expect(s.players[1]!.name).toBe('Alice')
    expect(s.players[1]!.hp).toBe(4)
    expect(s.players[1]!.general).toBe('caocao')
    expect(s.players[1]!.role).toBe('lord')
    expect(s.players[1]!.seat).toBe(1)
  })

  it('apply handles started + marks only (roster is syncPlayers domain)', () => {
    const { apply, syncPlayers, resetGame } = useGameStore.getState()
    resetGame()
    syncPlayers([{ id: 1, name: 'A', avatar: 'x', isSelf: true }])
    apply('StartGame', [])
    apply('SetPlayerMark', [1, '@test', 3])
    const s = useGameStore.getState()
    expect(s.started).toBe(true)
    expect(s.players[1]!.marks['@test']).toBe(3)
  })

  it('syncPlayers seeds Self and assigns display index 0 to self (waiting room)', () => {
    const { syncPlayers, resetGame } = useGameStore.getState()
    resetGame()
    // VM mirror lists Self first; no seats yet (waiting room).
    syncPlayers([
      { id: 2, name: 'webtester', avatar: 'liubei', isSelf: true },
      { id: 1, name: 'yueying', avatar: 'caocao' },
    ])
    const s = useGameStore.getState()
    expect(s.selfId).toBe(2)
    expect(Object.keys(s.players)).toHaveLength(2)
    expect(s.players[2]!.name).toBe('webtester')
    expect(s.players[2]!.index).toBe(0) // self at bottom
    expect(s.players[1]!.index).toBe(1) // other follows
  })

  it('syncPlayers with seats rotates Self to index 0 (after ArrangeSeats)', () => {
    const { syncPlayers, resetGame } = useGameStore.getState()
    resetGame()
    // seats assigned: yueying seat 1, webtester seat 2, self = webtester(2).
    syncPlayers([
      { id: 1, name: 'yueying', avatar: 'caocao', seat: 1 },
      { id: 2, name: 'webtester', avatar: 'liubei', seat: 2, isSelf: true },
    ])
    const s = useGameStore.getState()
    // order by seat [1,2], rotate so self(2) first -> [2,1] -> index 2:0, 1:1
    expect(s.players[2]!.index).toBe(0)
    expect(s.players[1]!.index).toBe(1)
  })
})
