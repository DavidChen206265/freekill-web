// timerStore tests — operation countdown start/stop + fractionLeft math.

import { describe, it, expect, beforeEach } from 'vitest'
import { useTimerStore, fractionLeft, DEFAULT_TIMEOUT_SEC } from '../src/stores/timerStore.js'

beforeEach(() => useTimerStore.setState({ running: false, totalMs: 0, deadline: 0, pendingSec: 0 }))

describe('timerStore', () => {
  it('setPending latches the timeout without showing the bar; start uses it', () => {
    useTimerStore.getState().setPending(15)
    expect(useTimerStore.getState().running).toBe(false) // latched only
    const before = Date.now()
    useTimerStore.getState().start()
    const s = useTimerStore.getState()
    expect(s.running).toBe(true)
    expect(s.totalMs).toBe(15000) // used the latched pending timeout
    expect(s.deadline).toBeGreaterThanOrEqual(before + 15000)
    expect(s.deadline).toBeLessThanOrEqual(Date.now() + 15000)
  })

  it('start: no pending + no arg falls back to the 30s default', () => {
    useTimerStore.getState().start()
    expect(useTimerStore.getState().running).toBe(true)
    expect(useTimerStore.getState().totalMs).toBe(DEFAULT_TIMEOUT_SEC * 1000)
    expect(DEFAULT_TIMEOUT_SEC).toBe(30)
  })

  it('start: is a no-op while already running (ui_emu re-emits UpdateRequestUI)', () => {
    useTimerStore.getState().start(30)
    const d0 = useTimerStore.getState().deadline
    useTimerStore.getState().start(5) // a click mid-request must not reset the bar
    expect(useTimerStore.getState().deadline).toBe(d0)
    expect(useTimerStore.getState().totalMs).toBe(30000)
  })

  it('stop: clears running (and lets a later start run again)', () => {
    useTimerStore.getState().start(15)
    useTimerStore.getState().stop()
    expect(useTimerStore.getState().running).toBe(false)
    useTimerStore.getState().start(10)
    expect(useTimerStore.getState().running).toBe(true)
    expect(useTimerStore.getState().totalMs).toBe(10000)
  })

  it('fractionLeft: clamps to [0,1] across the window', () => {
    const total = 10000
    const deadline = 100000
    expect(fractionLeft(total, deadline, 90000)).toBe(1)     // full
    expect(fractionLeft(total, deadline, 95000)).toBe(0.5)   // halfway
    expect(fractionLeft(total, deadline, 100000)).toBe(0)    // expired
    expect(fractionLeft(total, deadline, 110000)).toBe(0)    // past
    expect(fractionLeft(total, deadline, 80000)).toBe(1)     // before (clamped)
    expect(fractionLeft(0, deadline, 95000)).toBe(0)         // no window
  })
})
