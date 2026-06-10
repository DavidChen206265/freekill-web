// animationStore unit tests — the slice-V transient visual store. Verifies the
// per-player (nonce-bumped) and scene (id'd, removable) channels behave as the
// vmStore Animate/LogEvent dispatch + AnimationLayer/PhotoEffects expect.

import { describe, it, expect, beforeEach } from 'vitest'
import { useAnimationStore } from '../src/stores/animationStore.js'

beforeEach(() => { useAnimationStore.getState().reset() })

describe('animationStore', () => {
  it('pushPlayer sets the latest effect and bumps nonce on repeat', () => {
    const st = useAnimationStore.getState()
    st.pushPlayer(2, { kind: 'emotion', emotion: 'slash' })
    const a = useAnimationStore.getState().players[2]!
    expect(a.kind).toBe('emotion'); expect(a.emotion).toBe('slash')
    const n1 = a.nonce
    // Same effect again → new nonce so the component replays.
    st.pushPlayer(2, { kind: 'emotion', emotion: 'slash' })
    expect(useAnimationStore.getState().players[2]!.nonce).toBeGreaterThan(n1)
  })

  it('tremble + emotion on the same player: latest wins (Damage pushes both)', () => {
    const st = useAnimationStore.getState()
    st.pushPlayer(1, { kind: 'tremble' })
    st.pushPlayer(1, { kind: 'emotion', emotion: 'damage' })
    // Latest is the emotion; tremble was consumed via its own nonce by TrembleDriver.
    expect(useAnimationStore.getState().players[1]!.kind).toBe('emotion')
  })

  it('pushCard keyed by cid (is_card emotion)', () => {
    useAnimationStore.getState().pushCard(42, { kind: 'emotion', emotion: 'jink' })
    expect(useAnimationStore.getState().cards[42]!.emotion).toBe('jink')
  })

  it('pushScene returns an id and removeScene drops it', () => {
    const st = useAnimationStore.getState()
    const id = st.pushScene({ kind: 'indicate', from: 1, chains: [[2], [3]] })
    expect(useAnimationStore.getState().scene).toHaveLength(1)
    const e = useAnimationStore.getState().scene[0]!
    expect(e.id).toBe(id); expect(e.from).toBe(1); expect(e.chains).toEqual([[2], [3]])
    st.removeScene(id)
    expect(useAnimationStore.getState().scene).toHaveLength(0)
  })

  it('multiple scene effects coexist and remove independently', () => {
    const st = useAnimationStore.getState()
    const a = st.pushScene({ kind: 'indicate', from: 1, chains: [[2]] })
    const b = st.pushScene({ kind: 'ultSkill', player: 3, skillName: '业炎' })
    expect(useAnimationStore.getState().scene).toHaveLength(2)
    st.removeScene(a)
    const left = useAnimationStore.getState().scene
    expect(left).toHaveLength(1); expect(left[0]!.id).toBe(b)
  })

  it('pushTargeted pulses a nonce per target player (Indicate targets)', () => {
    const st = useAnimationStore.getState()
    st.pushTargeted([2, 3])
    const t1 = useAnimationStore.getState().targeted
    expect(t1[2]).toBeGreaterThan(0); expect(t1[3]).toBeGreaterThan(0)
    // re-targeting bumps the nonce so the ring replays
    const prev = t1[2]!
    st.pushTargeted([2])
    expect(useAnimationStore.getState().targeted[2]).toBeGreaterThan(prev)
  })

  it('reset clears everything', () => {
    const st = useAnimationStore.getState()
    st.pushPlayer(1, { kind: 'tremble' }); st.pushCard(2, { kind: 'emotion', emotion: 'x' }); st.pushScene({ kind: 'indicate' }); st.pushTargeted([4])
    st.reset()
    const s = useAnimationStore.getState()
    expect(s.players).toEqual({}); expect(s.cards).toEqual({}); expect(s.scene).toEqual([]); expect(s.targeted).toEqual({})
  })
})
