// timerStore tests — fixed-30s operation countdown + fractionLeft math.

import { describe, it, expect, beforeEach } from 'vitest'
import { useTimerStore, fractionLeft, TIMEOUT_SEC } from '../src/stores/timerStore.js'

beforeEach(() => useTimerStore.setState({ running: false, totalMs: 0, deadline: 0 }))

describe('timerStore', () => {
  it('start: runs a fixed 30s client-anchored countdown', () => {
    const before = Date.now()
    useTimerStore.getState().start()
    const s = useTimerStore.getState()
    expect(s.running).toBe(true)
    expect(TIMEOUT_SEC).toBe(30)
    expect(s.totalMs).toBe(30000)
    expect(s.deadline).toBeGreaterThanOrEqual(before + 30000)
    expect(s.deadline).toBeLessThanOrEqual(Date.now() + 30000)
  })

  it('stop: clears running; a later start runs again', () => {
    useTimerStore.getState().start()
    useTimerStore.getState().stop()
    expect(useTimerStore.getState().running).toBe(false)
    useTimerStore.getState().start()
    expect(useTimerStore.getState().running).toBe(true)
  })

  it('start: re-arms a fresh deadline each call (edge-driven by CountdownBar)', () => {
    useTimerStore.getState().start()
    const d0 = useTimerStore.getState().deadline
    // simulate time passing then a new request edge
    const later = Date.now() + 5
    while (Date.now() < later) { /* spin briefly */ }
    useTimerStore.getState().start()
    expect(useTimerStore.getState().deadline).toBeGreaterThanOrEqual(d0)
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
