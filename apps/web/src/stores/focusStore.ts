// focusStore.ts — the "current actor" indicator + per-Photo thinking countdown
// (RoomLogic.js MoveFocus / cancelAllFocus). MoveFocus(focuses[], command, timeout)
// highlights the focused players and shows a small progress bar + "<command>
// thinking..." tip under each (Photo.qml progressBar lines 359-398). Each MoveFocus
// REPLACES the previous focus (cancelAllFocus runs first). The bar counts down
// locally over `timeout` ms; on expiry the Photo hides it (UI only — no reply).

import { create } from 'zustand'

interface FocusState {
  /** Player ids currently focused (thinking). */
  ids: number[]
  /** The request command driving them (for the "<cmd> thinking..." tip). */
  command: string
  /** Total think window in ms (timeout or Config.roomTimeout default). */
  durationMs: number
  /** Absolute end time in ms epoch (start + durationMs). */
  deadline: number
  /** MoveFocus: replace the focus set (cancelAllFocus + set new). */
  setFocus: (ids: number[], command: string, timeoutMs: number) => void
  /** cancelAllFocus: clear everything. */
  clear: () => void
}

export const useFocusStore = create<FocusState>((set) => ({
  ids: [],
  command: '',
  durationMs: 0,
  deadline: 0,

  setFocus: (ids, command, timeoutMs) => {
    const durationMs = timeoutMs > 0 ? timeoutMs : 0
    set({ ids: ids ?? [], command: command ?? '', durationMs, deadline: Date.now() + durationMs })
  },

  clear: () => set({ ids: [], command: '', durationMs: 0, deadline: 0 }),
}))
