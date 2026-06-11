// waitingRoom.ts — pure derivation of waiting-room button state from the player
// roster. Mirrors WaitingRoom.qml (checkAllReady / isFull / isOwner). Kept pure
// so it's unit-testable without React.

import type { GamePlayer } from '../stores/gameStore.js'

export interface WaitingState {
  playerNum: number
  isFull: boolean
  isOwner: boolean
  isReady: boolean
  /** all non-owner players ready (owner needn't ready) — WaitingRoom.qml */
  isAllReady: boolean
  /** Ready button shown for non-owners; AddRobot for owner&!full; StartGame for owner&full. */
  showReady: boolean
  showAddRobot: boolean
  showStart: boolean
  startEnabled: boolean
}

export function deriveWaitingState(
  players: Record<number, GamePlayer>,
  selfId: number | undefined,
  capacity: number,
  // Server-advertised Web features (W0-2 manifest webFeatures). When undefined,
  // the server didn't tell us (old server / pre-login) → keep current behavior and
  // don't hide AddRobot. Only an explicit list that omits "AddRobot" hides it.
  serverFeatures?: string[],
): WaitingState {
  const list = Object.values(players)
  const playerNum = list.length
  const isFull = capacity > 0 && playerNum >= capacity
  const self = selfId !== undefined ? players[selfId] : undefined
  const isOwner = !!self?.owner
  const isReady = !!self?.ready
  const isAllReady = list.filter((p) => !p.owner).every((p) => p.ready)
  const robotAllowed = serverFeatures === undefined || serverFeatures.includes('AddRobot')
  return {
    playerNum,
    isFull,
    isOwner,
    isReady,
    isAllReady,
    showReady: !isOwner,
    showAddRobot: isOwner && !isFull && robotAllowed,
    showStart: isOwner && isFull,
    startEnabled: isOwner && isFull && isAllReady,
  }
}
