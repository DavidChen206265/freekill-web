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
  /** roomScene.activate(): (re)start the countdown. Uses the server window captured
   *  by setServerWindow if present, else a fixed TIMEOUT_SEC fallback. */
  activate: () => void
  /** Record the server's real request window (ms total, ms-epoch send time) from the
   *  request envelope; the next activate() aligns the bar to it. */
  setServerWindow: (totalMs: number, timestamp: number) => void
  /** state="notactive": hide/stop the countdown. */
  deactivate: () => void
}

export const useTimerStore = create<TimerState>((set) => ({
  running: false,
  totalMs: 0,
  deadline: 0,

  activate: () => {
    // Prefer the server's real request window (captured from the request envelope:
    // setServerWindow) so the bar matches when the server actually times out. The
    // server times out at timestamp + timeout*1000 (+500ms grace, request.lua:210),
    // so the deadline is absolute, not "now + 30s". Fall back to TIMEOUT_SEC when no
    // server window is known (it's consumed once per request, then cleared).
    const w = pendingWindow
    pendingWindow = null
    if (w) {
      const totalMs = w.totalMs
      const deadline = w.timestamp + totalMs
      // If the server window already elapsed (clock skew / very late), show a short
      // tail rather than a negative/instant bar.
      set({ running: true, totalMs, deadline: Math.max(deadline, Date.now() + 1000) })
      return
    }
    const totalMs = TIMEOUT_SEC * 1000
    set({ running: true, totalMs, deadline: Date.now() + totalMs })
  },

  setServerWindow: (totalMs, timestamp) => { pendingWindow = { totalMs, timestamp } },

  deactivate: () => set({ running: false }),
}))

// The most recent server request window (ms total + ms-epoch send time), captured
// from the request envelope and consumed by the next activate(). Module-level so it
// survives across the request→notify→activate hop without widening the store API.
let pendingWindow: { totalMs: number; timestamp: number } | null = null

/** Fraction remaining in [0,1] for the current instant (1 = full, 0 = expired). */
export function fractionLeft(totalMs: number, deadline: number, now: number): number {
  if (totalMs <= 0) return 0
  return Math.max(0, Math.min(1, (deadline - now) / totalMs))
}
