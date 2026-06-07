// timerStore.ts — the operation countdown (Room.qml `progress` ProgressBar +
// progressAnim). A server REQUEST carries timeout (seconds). QML anchors the bar
// to the server timestamp (elapsed = Date.now() - timestamp), which assumes the
// client and server share a clock. In this port the server runs in WSL and the
// browser on Windows, whose clocks drift — so we anchor the countdown to the
// CLIENT's own receive time instead (no cross-machine skew). On expiry the room
// leaves the active state and calls FinishRequestUI (UI cleanup only — the SERVER
// owns the real timeout and picks the default answer; the client never replies).

import { create } from 'zustand'

/** Default think window when a request carries no usable timeout (seconds). */
export const DEFAULT_TIMEOUT_SEC = 30

interface TimerState {
  /** Whether a countdown is active. */
  running: boolean
  /** Total request window in ms (timeout * 1000). */
  totalMs: number
  /** Absolute end time in ms epoch (client receive time + totalMs). */
  deadline: number
  /** Latched timeout (seconds) from the most recent request packet — QML's
   *  Backend.getRequestData().timeout. The visible countdown starts later, when
   *  the request UI actually activates (roomScene.activate()). */
  pendingSec: number
  /** Latch the timeout from a request packet (does NOT show the bar yet). */
  setPending: (timeoutSec: number) => void
  /** Start the visible countdown — called when the request UI activates. Uses the
   *  latched pending timeout (or an explicit override), falling back to 30s.
   *  No-op if already running, so the local ui_emu click loop (which re-emits
   *  UpdateRequestUI on every click) doesn't keep resetting the bar. */
  start: (timeoutSec?: number) => void
  /** Stop the countdown (reply sent, request cancelled, or expired). */
  stop: () => void
}

export const useTimerStore = create<TimerState>((set, get) => ({
  running: false,
  totalMs: 0,
  deadline: 0,
  pendingSec: 0,

  setPending: (timeoutSec) => set({ pendingSec: timeoutSec && timeoutSec > 0 ? timeoutSec : 0 }),

  start: (timeoutSec) => {
    if (get().running) return // already counting — don't reset on each ui_emu click
    const secs = timeoutSec && timeoutSec > 0 ? timeoutSec
      : get().pendingSec > 0 ? get().pendingSec
      : DEFAULT_TIMEOUT_SEC
    const totalMs = secs * 1000
    // Anchor to the client's own clock at activate time — avoids WSL/Windows skew.
    set({ running: true, totalMs, deadline: Date.now() + totalMs })
  },

  stop: () => set({ running: false }),
}))

/** Fraction remaining in [0,1] for the current instant (1 = full, 0 = expired). */
export function fractionLeft(totalMs: number, deadline: number, now: number): number {
  if (totalMs <= 0) return 0
  return Math.max(0, Math.min(1, (deadline - now) / totalMs))
}
