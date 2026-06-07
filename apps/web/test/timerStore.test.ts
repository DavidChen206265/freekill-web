// timerStore tests — 1:1 with the Room.qml state machine: activate() (re)starts a
// fixed-30s countdown, deactivate() stops it.

import { describe, it, expect, beforeEach } from 'vitest'
import { useTimerStore, fractionLeft, TIMEOUT_SEC } from '../src/stores/timerStore.js'

beforeEach(() => useTimerStore.setState({ running: false, totalMs: 0, deadline: 0 }))

describe('timerStore', () => {
  it('activate: runs a fixed 30s client-anchored countdown (roomScene.activate)', () => {
    const before = Date.now()
    useTimerStore.getState().activate()
    const s = useTimerStore.getState()
    expect(s.running).toBe(true)
    expect(TIMEOUT_SEC).toBe(30)
    expect(s.totalMs).toBe(30000)
    expect(s.deadline).toBeGreaterThanOrEqual(before + 30000)
    expect(s.deadline).toBeLessThanOrEqual(Date.now() + 30000)
  })

  it('activate: ALWAYS restarts fresh (QML: if active →notactive; →active)', async () => {
    useTimerStore.getState().activate()
    const d0 = useTimerStore.getState().deadline
    await new Promise((r) => setTimeout(r, 5))
    useTimerStore.getState().activate()
    expect(useTimerStore.getState().deadline).toBeGreaterThan(d0)
    expect(useTimerStore.getState().running).toBe(true)
  })

  it('deactivate: stops (state="notactive"); activate runs again', () => {
    useTimerStore.getState().activate()
    useTimerStore.getState().deactivate()
    expect(useTimerStore.getState().running).toBe(false)
    useTimerStore.getState().activate()
    expect(useTimerStore.getState().running).toBe(true)
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
