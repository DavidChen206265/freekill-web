// interactionStore unit tests — UpdateRequestUI change-diff merge (ui_emu shape).

import { describe, it, expect, beforeEach } from 'vitest'
import { useInteractionStore } from '../src/stores/interactionStore.js'

beforeEach(() => useInteractionStore.getState().clear())

describe('interactionStore.applyChange', () => {
  it('seeds items from _new and applies prompt/type', () => {
    useInteractionStore.getState().applyChange({
      _type: 'Room',
      _prompt: '出牌阶段',
      _new: [
        { type: 'CardItem', data: { id: 7, enabled: true, selected: false } },
        { type: 'Photo', data: { id: 2, enabled: false } },
        { type: 'Button', data: { id: 'OK', enabled: false } },
      ],
    })
    const s = useInteractionStore.getState()
    expect(s.active).toBe(true)
    expect(s.prompt).toBe('出牌阶段')
    expect(s.cards[7]!.enabled).toBe(true)
    expect(s.photos[2]!.enabled).toBe(false)
    expect(s.buttons['OK']!.enabled).toBe(false)
  })

  it('merges incremental diffs (only changed items present)', () => {
    const st = useInteractionStore.getState()
    st.applyChange({ _new: [
      { type: 'CardItem', data: { id: 7, enabled: true } },
      { type: 'Photo', data: { id: 2, enabled: false } },
      { type: 'Button', data: { id: 'OK', enabled: false } },
    ] })
    // Selecting card 7 → VM enables a target + OK; pushes only the deltas.
    st.applyChange({
      CardItem: [{ id: 7, enabled: true, selected: true }],
      Photo: [{ id: 2, enabled: true }],
      Button: [{ id: 'OK', enabled: true }],
    })
    const s = useInteractionStore.getState()
    expect(s.cards[7]!.selected).toBe(true)
    expect(s.photos[2]!.enabled).toBe(true)
    expect(s.buttons['OK']!.enabled).toBe(true)
  })

  it('updates SpecialSkills list', () => {
    const st = useInteractionStore.getState()
    st.applyChange({ SpecialSkills: [{ id: '1', skills: ['_normal_use', 'recast'] }] })
    expect(useInteractionStore.getState().specialSkills).toEqual(['_normal_use', 'recast'])
  })

  it('_delete removes items', () => {
    const st = useInteractionStore.getState()
    st.applyChange({ _new: [{ type: 'CardItem', data: { id: 9, enabled: true } }] })
    expect(useInteractionStore.getState().cards[9]).toBeTruthy()
    st.applyChange({ _delete: [{ type: 'CardItem', id: 9 }] })
    expect(useInteractionStore.getState().cards[9]).toBeUndefined()
  })

  it('clear resets to inactive', () => {
    const st = useInteractionStore.getState()
    st.applyChange({ _prompt: 'x', _new: [{ type: 'Button', data: { id: 'OK', enabled: true } }] })
    st.clear()
    const s = useInteractionStore.getState()
    expect(s.active).toBe(false)
    expect(s.prompt).toBe('')
    expect(Object.keys(s.buttons)).toHaveLength(0)
  })
})
