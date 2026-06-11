// miscStore.ts — table "misc status" (MiscStatus.qml): current round number, the
// remaining draw-pile count, and an elapsed game timer. Fed by the VM's notifyUI
// UpdateRoundNum / UpdateDrawPile (RoomLogic.js:1520-1528). The elapsed time is a
// purely local tick (QML uses a local Timer too, MiscStatus.qml:41-49).
//
// W1-1 2b: the game-start anchor is persisted to sessionStorage so it survives a
// reconnect (vmStore.reset zeroes the store) AND a hard page refresh — both replay
// StartGame, which previously re-anchored the clock to "now" and made elapsed time
// jump back to 0. Now startClock() reuses the stored anchor if one exists for this
// session, so the timer always reflects real elapsed time since the game started.

import { create } from 'zustand'

const ANCHOR_KEY = 'fk-game-started-at'
function loadAnchor(): number {
  try { return Number(sessionStorage.getItem(ANCHOR_KEY)) || 0 } catch { return 0 }
}
function saveAnchor(v: number): void {
  try { v ? sessionStorage.setItem(ANCHOR_KEY, String(v)) : sessionStorage.removeItem(ANCHOR_KEY) } catch { /* ignore */ }
}

interface MiscState {
  /** Remaining cards in the draw pile (UpdateDrawPile). */
  pileNum: number
  /** Current round number (UpdateRoundNum). */
  roundNum: number
  /** Epoch ms when the elapsed-time clock started (StartGame), 0 = not running. */
  startedAt: number
  setPileNum: (n: number) => void
  setRoundNum: (n: number) => void
  /** Begin the elapsed-time clock (StartGame). Reuses a persisted anchor across
   *  reconnect/refresh so elapsed time doesn't reset (2b). */
  startClock: () => void
  /** Clear the persisted clock anchor — call on GameOver so the NEXT game starts
   *  fresh. (reset() intentionally keeps the anchor so reconnect mid-game resumes.) */
  clearClock: () => void
  reset: () => void
}

export const useMiscStore = create<MiscState>((set) => ({
  // Restore the anchor on store init so a hard refresh keeps the clock running.
  pileNum: 0,
  roundNum: 0,
  startedAt: loadAnchor(),
  setPileNum: (n) => set({ pileNum: n }),
  setRoundNum: (n) => set({ roundNum: n }),
  startClock: () => set((s) => {
    if (s.startedAt) return {}                       // already running (this session)
    const stored = loadAnchor()
    if (stored) return { startedAt: stored }          // reconnect/refresh: reuse anchor
    const now = Date.now()
    saveAnchor(now)
    return { startedAt: now }                         // fresh game: anchor at now
  }),
  clearClock: () => { saveAnchor(0); set({ startedAt: 0 }) },
  // reset() runs on reconnect (vmStore.reset) AND on leaving the room. It must KEEP
  // the persisted anchor so a mid-game reconnect resumes the clock; the in-memory
  // startedAt is restored from storage by startClock() when StartGame replays.
  // GameOver / fresh-game boundaries clear it via clearClock().
  reset: () => set({ pileNum: 0, roundNum: 0, startedAt: 0 }),
}))
