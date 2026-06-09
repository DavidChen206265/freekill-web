// cardNoteStore unit tests — table-card footnote / virtual-name annotations
// (SetCardFootnote / SetCardVirtName), consumed by CardLayer.

import { describe, it, expect, beforeEach } from 'vitest'
import { useCardNoteStore } from '../src/stores/cardNoteStore.js'

beforeEach(() => { useCardNoteStore.getState().reset() })

describe('cardNoteStore', () => {
  it('setFootnote annotates each id', () => {
    useCardNoteStore.getState().setFootnote([10, 11], '黄盖 使用')
    const n = useCardNoteStore.getState().notes
    expect(n[10]!.footnote).toBe('黄盖 使用')
    expect(n[11]!.footnote).toBe('黄盖 使用')
  })

  it('setVirtName annotates each id and merges with footnote', () => {
    const st = useCardNoteStore.getState()
    st.setFootnote([5], 'note')
    st.setVirtName([5], '杀')
    expect(useCardNoteStore.getState().notes[5]).toEqual({ footnote: 'note', virtName: '杀' })
  })

  it('reset clears all notes', () => {
    useCardNoteStore.getState().setFootnote([1], 'x')
    useCardNoteStore.getState().reset()
    expect(useCardNoteStore.getState().notes).toEqual({})
  })
})
