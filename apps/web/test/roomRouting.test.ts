// roomRouting regression tests (M3 R1). The bug: routeEnvelope only booted the VM
// on the asio server packet "EnterRoom", so the "Observe"/"Reconnect" server
// packets fell through to the lobby default branch and were dropped → the VM never
// booted → observe/reconnect broke (audit P2B-006/007/014, P2A-014).

import { describe, it, expect } from 'vitest'
import { isRoomBootstrap, ROOM_BOOTSTRAP_COMMANDS } from '../src/stores/roomRouting.js'

describe('isRoomBootstrap', () => {
  it('boots the room VM on all three asio bootstrap commands', () => {
    expect(isRoomBootstrap('EnterRoom')).toBe(true)
    expect(isRoomBootstrap('Observe')).toBe(true)
    expect(isRoomBootstrap('Reconnect')).toBe(true)
  })

  it('does not treat lobby/in-room notifies as a room bootstrap', () => {
    for (const cmd of ['EnterLobby', 'Heartbeat', 'UpdateRoomList', 'UpdatePlayerNum', 'Chat', 'AddPlayer', 'StartGame', 'MoveCards']) {
      expect(isRoomBootstrap(cmd)).toBe(false)
    }
  })

  it('exposes exactly the three bootstrap commands', () => {
    expect([...ROOM_BOOTSTRAP_COMMANDS].sort()).toEqual(['EnterRoom', 'Observe', 'Reconnect'])
  })
})
