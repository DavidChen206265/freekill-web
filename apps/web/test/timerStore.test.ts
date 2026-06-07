// timerStore tests — operation countdown start/stop + fractionLeft math.

import { describe, it, expect, beforeEach } from 'vitest'
import { useTimerStore, fractionLeft, DEFAULT_TIMEOUT_SEC } from '../src/stores/timerStore.js'

beforeEach(() => useTimerStore.setState({ running: false, totalMs: 0, deadline: 0 }))

describe('timerStore', () => {
  it('start: runs a client-anchored countdown from timeout(sec)', () => {
    const before = Date.now()
    useTimerStore.getState().start(15)
    const s = useTimerStore.getState()
    expect(s.running).toBe(true)
    expect(s.totalMs).toBe(15000)
    // Anchored to the client clock at receive time (not a server timestamp).
    expect(s.deadline).toBeGreaterThanOrEqual(before + 15000)
    expect(s.deadline).toBeLessThanOrEqual(Date.now() + 15000)
  })

  it('start: missing/zero timeout falls back to the 30s default (always shows)', () => {
    useTimerStore.getState().start(0)
    expect(useTimerStore.getState().running).toBe(true)
    expect(useTimerStore.getState().totalMs).toBe(DEFAULT_TIMEOUT_SEC * 1000)
    expect(DEFAULT_TIMEOUT_SEC).toBe(30)
  })

  it('stop: clears running', () => {
    useTimerStore.getState().start(15)
    useTimerStore.getState().stop()
    expect(useTimerStore.getState().running).toBe(false)
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
