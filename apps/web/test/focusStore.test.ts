// focusStore tests — MoveFocus set/replace + cancelAllFocus.

import { describe, it, expect, beforeEach } from 'vitest'
import { useFocusStore } from '../src/stores/focusStore.js'

beforeEach(() => useFocusStore.getState().clear())

describe('focusStore', () => {
  it('setFocus: stores ids + command + a deadline from the window', () => {
    const before = Date.now()
    useFocusStore.getState().setFocus([2, 3], 'PlayCard', 15000)
    const s = useFocusStore.getState()
    expect(s.ids).toEqual([2, 3])
    expect(s.command).toBe('PlayCard')
    expect(s.durationMs).toBe(15000)
    expect(s.deadline).toBeGreaterThanOrEqual(before + 15000)
  })

  it('setFocus: replaces the previous focus set (cancelAllFocus semantics)', () => {
    useFocusStore.getState().setFocus([2], 'A', 10000)
    useFocusStore.getState().setFocus([5], 'B', 10000)
    expect(useFocusStore.getState().ids).toEqual([5])
    expect(useFocusStore.getState().command).toBe('B')
  })

  it('clear: empties the focus', () => {
    useFocusStore.getState().setFocus([2, 3], 'X', 10000)
    useFocusStore.getState().clear()
    expect(useFocusStore.getState().ids).toEqual([])
    expect(useFocusStore.getState().command).toBe('')
  })
})
