// timerStore.ts — the operation countdown (Room.qml `progress` ProgressBar). The
// QML bar is anchored to the server timestamp; here the server runs in WSL and the
// browser on Windows (clock skew), so we anchor to the CLIENT clock and use a
// FIXED 30s think window. The countdown is driven by the active-request EDGE
// (CountdownBar watches whether any request UI is active) rather than scattered
// per-command start/stop calls — which was fragile across request boundaries. On
// expiry CountdownBar calls FinishRequestUI (UI cleanup only — the server owns the
// real timeout and picks the default answer; the client never auto-replies).

import { create } from 'zustand'

/** Fixed think window for the operation countdown (seconds). */
export const TIMEOUT_SEC = 30

interface TimerState {
  /** Whether a countdown is active. */
  running: boolean
  /** Total window in ms (TIMEOUT_SEC * 1000). */
  totalMs: number
  /** Absolute end time in ms epoch (client start time + totalMs). */
  deadline: number
  /** Start a fresh fixed-30s countdown (called on the active-request rising edge). */
  start: () => void
  /** Stop the countdown (active-request falling edge / expiry). */
  stop: () => void
}

export const useTimerStore = create<TimerState>((set) => ({
  running: false,
  totalMs: 0,
  deadline: 0,

  start: () => {
    const totalMs = TIMEOUT_SEC * 1000
    set({ running: true, totalMs, deadline: Date.now() + totalMs })
  },

  stop: () => set({ running: false }),
}))

/** Fraction remaining in [0,1] for the current instant (1 = full, 0 = expired). */
export function fractionLeft(totalMs: number, deadline: number, now: number): number {
  if (totalMs <= 0) return 0
  return Math.max(0, Math.min(1, (deadline - now) / totalMs))
}
