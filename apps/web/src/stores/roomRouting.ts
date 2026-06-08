// roomRouting.ts — pure routing helpers (no VM/DOM deps) so they can be unit
// tested without pulling in the wasmoon VM that stores/index.ts transitively
// imports.

// asio server→client commands that bootstrap a room VM (see routeEnvelope in
// stores/index.ts):
//   - EnterRoom : normal join / waiting room (asio room.cpp:190)
//   - Observe   : join a running room as observer (asio room.cpp:346)
//   - Reconnect : rejoin after disconnect (asio serverplayer.cpp:246)
// The client Lua handles Observe/Reconnect via loadRoomSummary, which re-emits
// notifyUI("EnterRoom") (clientbase.lua:470) on the VM-output sink — that is a
// separate path from these server packets, so widening the boot trigger here does
// not double-boot.
export const ROOM_BOOTSTRAP_COMMANDS = new Set(['EnterRoom', 'Observe', 'Reconnect'])

export function isRoomBootstrap(command: string): boolean {
  return ROOM_BOOTSTRAP_COMMANDS.has(command)
}
