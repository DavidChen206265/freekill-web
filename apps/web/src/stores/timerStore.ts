// timerStore.ts — the operation countdown (Room.qml `progress` ProgressBar +
// progressAnim). A server REQUEST carries timeout (seconds) + timestamp (ms epoch
// when the server started waiting). Room.qml notactive→active reads them:
//   total   = timeout * 1000
//   elapsed = Date.now() - timestamp
//   bar runs from (1 - elapsed/total)*100 down to 0 over (total - elapsed) ms
// On finish the room leaves the active state and calls FinishRequestUI (UI cleanup
// only — the SERVER owns the real timeout and picks the default answer; the client
// never auto-replies). We store the deadline; the bar component animates locally.

import { create } from 'zustand'

interface TimerState {
  /** Whether a countdown is active. */
  running: boolean
  /** Total request window in ms (timeout * 1000). */
  totalMs: number
  /** Absolute end time in ms epoch (timestamp + totalMs). */
  deadline: number
  /** Start a countdown from a request's timeout(seconds) + timestamp(ms epoch). */
  start: (timeoutSec: number, timestampMs: number) => void
  /** Stop the countdown (reply sent, request cancelled, or expired). */
  stop: () => void
}

export const useTimerStore = create<TimerState>((set) => ({
  running: false,
  totalMs: 0,
  deadline: 0,

  start: (timeoutSec, timestampMs) => {
    const totalMs = Math.max(0, (timeoutSec || 0) * 1000)
    if (totalMs <= 0) { set({ running: false }); return }
    const base = timestampMs && timestampMs > 0 ? timestampMs : Date.now()
    const deadline = base + totalMs
    // Already expired on arrival → don't show a bar.
    if (deadline <= Date.now()) { set({ running: false, totalMs, deadline }); return }
    set({ running: true, totalMs, deadline })
  },

  stop: () => set({ running: false }),
}))

/** Fraction remaining in [0,1] for the current instant (1 = full, 0 = expired). */
export function fractionLeft(totalMs: number, deadline: number, now: number): number {
  if (totalMs <= 0) return 0
  return Math.max(0, Math.min(1, (deadline - now) / totalMs))
}
