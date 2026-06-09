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

  it('keeps the existing prompt when _prompt is empty (RoomLogic.js truthy guard)', () => {
    const st = useInteractionStore.getState()
    // A request command set a default prompt (vmStore defaultPrompt → setPrompt).
    st.setPrompt('请使用【杀】')
    // The ui_emu UpdateRequestUI then arrives with an EMPTY _prompt (no explicit
    // server prompt). It must NOT clobber the default (QML drops empty _prompt).
    st.applyChange({ _prompt: '', CardItem: [{ id: 5, enabled: true }] })
    expect(useInteractionStore.getState().prompt).toBe('请使用【杀】')
    // A non-empty _prompt DOES update it (later click recomputes a real prompt).
    st.applyChange({ _prompt: '请选择目标' })
    expect(useInteractionStore.getState().prompt).toBe('请选择目标')
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

  it('consumes the dynamic Interaction subpanel from _new and clears it on _delete', () => {
    // M4 I-4: Room.qml:781 — a _new item of type "Interaction" carries
    // { spec:{type,...}, skill_name }; _delete of type "Interaction" removes it.
    const st = useInteractionStore.getState()
    st.applyChange({ _new: [{ type: 'Interaction', data: { spec: { type: 'combo', choices: ['a', 'b'], all_choices: ['a', 'b'], default: 'a' }, skill_name: 'zhiheng' } }] })
    let s = useInteractionStore.getState()
    expect(s.interaction).not.toBeNull()
    expect(s.interaction!.type).toBe('combo')
    expect(s.interaction!.skill).toBe('zhiheng')
    expect(s.interaction!.all_choices).toEqual(['a', 'b'])
    // a later change without an Interaction _delete leaves it intact
    st.applyChange({ CardItem: [{ id: 5, enabled: true }] })
    expect(useInteractionStore.getState().interaction).not.toBeNull()
    // _delete of type Interaction removes it
    st.applyChange({ _delete: [{ type: 'Interaction', id: '1' }] })
    s = useInteractionStore.getState()
    expect(s.interaction).toBeNull()
  })
})
