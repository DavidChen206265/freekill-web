// miscStore.ts — table "misc status" (MiscStatus.qml): current round number, the
// remaining draw-pile count, and an elapsed game timer. Fed by the VM's notifyUI
// UpdateRoundNum / UpdateDrawPile (RoomLogic.js:1520-1528). The elapsed time is a
// purely local tick (QML uses a local Timer too, MiscStatus.qml:41-49), started when
// the game starts and reset on leave.

import { create } from 'zustand'

interface MiscState {
  /** Remaining cards in the draw pile (UpdateDrawPile). */
  pileNum: number
  /** Current round number (UpdateRoundNum). */
  roundNum: number
  /** Epoch ms when the elapsed-time clock started (StartGame), 0 = not running. */
  startedAt: number
  setPileNum: (n: number) => void
  setRoundNum: (n: number) => void
  /** Begin the elapsed-time clock (on StartGame). */
  startClock: () => void
  reset: () => void
}

export const useMiscStore = create<MiscState>((set) => ({
  pileNum: 0,
  roundNum: 0,
  startedAt: 0,
  setPileNum: (n) => set({ pileNum: n }),
  setRoundNum: (n) => set({ roundNum: n }),
  startClock: () => set((s) => (s.startedAt ? {} : { startedAt: Date.now() })),
  reset: () => set({ pileNum: 0, roundNum: 0, startedAt: 0 }),
}))
