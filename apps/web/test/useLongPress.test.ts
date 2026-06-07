// useLongPress unit tests — verify the gesture fires after the hold delay and is
// cancelled by movement / early release, with fake timers.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { makeLongPress } from '../src/table/useLongPress.js'

// Minimal pointer-event stub (only clientX/clientY are read).
const pe = (x: number, y: number) => ({ clientX: x, clientY: y }) as unknown as React.PointerEvent
// Fresh ref bag per gesture, mirroring useRef at runtime.
const mk = (fn: () => void) => makeLongPress(fn, {
  timer: { current: null }, start: { current: null }, fired: { current: false },
})

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useLongPress', () => {
  it('fires onLongPress after the hold delay when the pointer stays put', () => {
    const fn = vi.fn()
    const h = mk(fn)
    h.onPointerDown(pe(100, 100))
    vi.advanceTimersByTime(449)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(h.consumeFired()).toBe(true)  // and the trailing click is suppressed once
    expect(h.consumeFired()).toBe(false) // consumed
  })

  it('does NOT fire on a quick release (a normal tap → target select)', () => {
    const fn = vi.fn()
    const h = mk(fn)
    h.onPointerDown(pe(100, 100))
    vi.advanceTimersByTime(200)
    h.onPointerUp()
    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
    expect(h.consumeFired()).toBe(false)
  })

  it('cancels when the pointer moves past the slop (drag/scroll)', () => {
    const fn = vi.fn()
    const h = mk(fn)
    h.onPointerDown(pe(100, 100))
    h.onPointerMove(pe(100, 120)) // moved 20px > slop
    vi.advanceTimersByTime(600)
    expect(fn).not.toHaveBeenCalled()
  })

  it('tolerates tiny jitter within the slop', () => {
    const fn = vi.fn()
    const h = mk(fn)
    h.onPointerDown(pe(100, 100))
    h.onPointerMove(pe(108, 108)) // < 12px
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
