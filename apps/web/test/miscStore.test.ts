// miscStore unit tests — round/pile counters + elapsed clock (MiscStatus).

import { describe, it, expect, beforeEach } from 'vitest'
import { useMiscStore } from '../src/stores/miscStore.js'

beforeEach(() => useMiscStore.getState().reset())

describe('miscStore', () => {
  it('setPileNum / setRoundNum update the counters', () => {
    useMiscStore.getState().setPileNum(42)
    useMiscStore.getState().setRoundNum(3)
    expect(useMiscStore.getState().pileNum).toBe(42)
    expect(useMiscStore.getState().roundNum).toBe(3)
  })

  it('startClock sets startedAt once (idempotent — does not reset mid-game)', () => {
    const st = useMiscStore.getState()
    st.startClock()
    const t = useMiscStore.getState().startedAt
    expect(t).toBeGreaterThan(0)
    st.startClock() // second StartGame-like call must NOT restart the clock
    expect(useMiscStore.getState().startedAt).toBe(t)
  })

  it('reset clears everything (leave room / new game)', () => {
    const st = useMiscStore.getState()
    st.setPileNum(10); st.setRoundNum(2); st.startClock()
    st.reset()
    const s = useMiscStore.getState()
    expect(s.pileNum).toBe(0); expect(s.roundNum).toBe(0); expect(s.startedAt).toBe(0)
  })
})
