// timerStore tests — operation countdown start/stop + fractionLeft math.

import { describe, it, expect, beforeEach } from 'vitest'
import { useTimerStore, fractionLeft } from '../src/stores/timerStore.js'

beforeEach(() => useTimerStore.setState({ running: false, totalMs: 0, deadline: 0 }))

describe('timerStore', () => {
  it('start: sets a running countdown from timeout(sec) + timestamp(ms)', () => {
    const now = Date.now()
    useTimerStore.getState().start(15, now)
    const s = useTimerStore.getState()
    expect(s.running).toBe(true)
    expect(s.totalMs).toBe(15000)
    expect(s.deadline).toBe(now + 15000)
  })

  it('start: timeout 0 does not run (no bar)', () => {
    useTimerStore.getState().start(0, Date.now())
    expect(useTimerStore.getState().running).toBe(false)
  })

  it('start: an already-expired request does not run', () => {
    useTimerStore.getState().start(10, Date.now() - 20000) // started 20s ago, 10s window
    expect(useTimerStore.getState().running).toBe(false)
  })

  it('start: missing timestamp falls back to now', () => {
    const before = Date.now()
    useTimerStore.getState().start(15, 0)
    const s = useTimerStore.getState()
    expect(s.running).toBe(true)
    expect(s.deadline).toBeGreaterThanOrEqual(before + 15000)
  })

  it('stop: clears running', () => {
    useTimerStore.getState().start(15, Date.now())
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
