// timerStore.ts — the operation countdown, a 1:1 port of the Room.qml state
// machine (Room.qml:59-120) + roomScene.activate() (Room.qml:730-733).
//
// QML model:
//   • roomScene.activate() (called by each request callback that needs UI —
//     PlayCard / AskForUseCard / AskForResponseCard / AskForGeneral / AskFor* …)
//     does: if(state==="active") state="notactive"; state="active";  → ALWAYS
//     re-runs the notactive→active transition, which resets progressAnim.from=100
//     and restarts the bar. So each request RESTARTS the countdown fresh.
//   • The notactive→active transition reads Backend.getRequestData() timeout/
//     timestamp and shows the bar. We use a FIXED 30s window (server timestamp is
//     untrustworthy across the WSL/Windows clock boundary, and 30s was requested).
//   • state="notactive" (CancelRequest, or finishRequestUI/reply) hides the bar.
//   • The ui_emu click loop goes through updateRequestUI, NOT the request callback,
//     so it does NOT call activate() → the bar is not reset on each click.
// On expiry CountdownBar runs the →notactive cleanup (finishRequestUI); the server
// owns the real timeout and picks the default answer — the client never replies.

import { create } from 'zustand'

/** Fixed think window for the operation countdown (seconds). */
export const TIMEOUT_SEC = 30

interface TimerState {
  /** Mirrors roomScene.state: true = "active" (bar visible), false = "notactive". */
  running: boolean
  /** Total window in ms (TIMEOUT_SEC * 1000). */
  totalMs: number
  /** Absolute end time in ms epoch (client activate time + totalMs). */
  deadline: number
  /** roomScene.activate(): (re)start a fresh fixed-30s countdown. Always restarts,
   *  matching `if(active) →notactive; →active`. */
  activate: () => void
  /** state="notactive": hide/stop the countdown. */
  deactivate: () => void
}

export const useTimerStore = create<TimerState>((set) => ({
  running: false,
  totalMs: 0,
  deadline: 0,

  activate: () => {
    const totalMs = TIMEOUT_SEC * 1000
    set({ running: true, totalMs, deadline: Date.now() + totalMs })
  },

  deactivate: () => set({ running: false }),
}))

/** Fraction remaining in [0,1] for the current instant (1 = full, 0 = expired). */
export function fractionLeft(totalMs: number, deadline: number, now: number): number {
  if (totalMs <= 0) return 0
  return Math.max(0, Math.min(1, (deadline - now) / totalMs))
}
