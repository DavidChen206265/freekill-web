// waitingRoom derivation unit tests — mirrors WaitingRoom.qml button logic.

import { describe, it, expect } from 'vitest'
import { deriveWaitingState } from '../src/table/waitingState.js'
import type { GamePlayer } from '../src/stores/gameStore.js'

function mk(id: number, over: Partial<GamePlayer> = {}): GamePlayer {
  return { id, name: `P${id}`, avatar: '', index: id, marks: {}, ...over }
}

describe('deriveWaitingState', () => {
  it('owner of a not-full room sees Add Robot, not Ready/Start', () => {
    const players = { 1: mk(1, { owner: true }) }
    const s = deriveWaitingState(players, 1, 2)
    expect(s.isOwner).toBe(true)
    expect(s.isFull).toBe(false)
    expect(s.showAddRobot).toBe(true)
    expect(s.showStart).toBe(false)
    expect(s.showReady).toBe(false)
  })

  it('non-owner sees Ready', () => {
    const players = { 1: mk(1, { owner: true }), 2: mk(2) }
    const s = deriveWaitingState(players, 2, 2)
    expect(s.isOwner).toBe(false)
    expect(s.showReady).toBe(true)
    expect(s.showAddRobot).toBe(false)
    expect(s.showStart).toBe(false)
  })

  it('owner of full room: Start disabled until all non-owners ready', () => {
    const notReady = { 1: mk(1, { owner: true }), 2: mk(2, { ready: false }) }
    let s = deriveWaitingState(notReady, 1, 2)
    expect(s.isFull).toBe(true)
    expect(s.showStart).toBe(true)
    expect(s.startEnabled).toBe(false) // P2 not ready

    const allReady = { 1: mk(1, { owner: true }), 2: mk(2, { ready: true }) }
    s = deriveWaitingState(allReady, 1, 2)
    expect(s.startEnabled).toBe(true) // owner needn't ready; P2 ready
  })

  it('isReady reflects self', () => {
    const players = { 1: mk(1, { owner: true }), 2: mk(2, { ready: true }) }
    expect(deriveWaitingState(players, 2, 2).isReady).toBe(true)
    expect(deriveWaitingState(players, 1, 2).isReady).toBe(false)
  })
})
