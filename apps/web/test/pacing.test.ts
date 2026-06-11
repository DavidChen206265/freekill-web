// pacing unit tests — the performance-beat table + pace multiplier. Verifies that
// state/instant commands pace to 0 (no wait) and visual performances mirror their
// render-component durations, and that the localStorage pace multiplier clamps.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { paceFor, getPace, setPace, waitBeat } from '../src/stores/pacing.js'

// Minimal localStorage stub for node (vitest default env has none). pacing.ts reads
// it through try/catch, so absence is safe; we install one to test the round-trip.
function installLocalStorage(): Record<string, string> {
  const store: Record<string, string> = {}
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => { store[k] = String(v) },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
    key: () => null,
    length: 0,
  } as Storage
  return store
}

describe('pacing.paceFor', () => {
  it('state-mirror / unknown commands pace to 0 (no beat)', () => {
    expect(paceFor('PropertyUpdate', {})).toBe(0)
    expect(paceFor('UpdateDrawPile', 5)).toBe(0)
    expect(paceFor('SetPlayerMark', {})).toBe(0)
    expect(paceFor('GameLog', {})).toBe(0)
  })

  it('MoveCards beats the card fly-in duration', () => {
    expect(paceFor('MoveCards', { merged: [] })).toBe(500)
  })

  it('Animate beat depends on sub-type', () => {
    expect(paceFor('Animate', { type: 'Indicate' })).toBe(700)
    expect(paceFor('Animate', { type: 'Emotion' })).toBe(500)
    expect(paceFor('Animate', { type: 'InvokeSkill' })).toBe(1640)
    expect(paceFor('Animate', { type: 'InvokeUltSkill' })).toBe(1640)
    // SuperLightBox/LightBox render nothing/no-op → no beat.
    expect(paceFor('Animate', { type: 'SuperLightBox' })).toBe(0)
    expect(paceFor('Animate', { type: 'LightBox' })).toBe(0)
    expect(paceFor('Animate', {})).toBe(0)
  })

  it('LogEvent: visual events beat, audio-only events do not', () => {
    expect(paceFor('LogEvent', { type: 'Damage' })).toBe(200)
    expect(paceFor('LogEvent', { type: 'Death' })).toBe(500)
    // Audio-only — must not gate the next command.
    expect(paceFor('LogEvent', { type: 'LoseHP' })).toBe(0)
    expect(paceFor('LogEvent', { type: 'PlaySkillSound' })).toBe(0)
    expect(paceFor('LogEvent', { type: 'PlaySound' })).toBe(0)
  })
})

describe('pacing.getPace / setPace', () => {
  beforeEach(() => { installLocalStorage() })
  afterEach(() => { delete (globalThis as unknown as { localStorage?: Storage }).localStorage })

  it('defaults to 1 when unset', () => {
    expect(getPace()).toBe(1)
  })

  it('clamps to [0.1, 5] and persists', () => {
    expect(setPace(2)).toBe(2)
    expect(getPace()).toBe(2)
    expect(setPace(99)).toBe(5)   // above max
    expect(setPace(0.001)).toBe(0.1) // below min
    expect(setPace(0)).toBe(1)    // non-positive → default
    expect(setPace(NaN)).toBe(1)  // invalid → default
  })
})

describe('pacing.waitBeat', () => {
  beforeEach(() => { installLocalStorage() })
  afterEach(() => { delete (globalThis as unknown as { localStorage?: Storage }).localStorage })

  it('resolves immediately for a 0 / negative base beat (no timer)', async () => {
    const start = Date.now()
    await waitBeat(0)
    await waitBeat(-5)
    expect(Date.now() - start).toBeLessThan(20)
  })

  it('waits ~base*pace for a positive beat', async () => {
    setPace(0.1) // 500ms * 0.1 = 50ms — keep the test fast
    const start = Date.now()
    await waitBeat(paceFor('MoveCards', { merged: [] }))
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40)
    expect(elapsed).toBeLessThan(200)
  })
})
