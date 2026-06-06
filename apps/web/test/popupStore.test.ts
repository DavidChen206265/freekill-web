// popupStore unit tests — popup-request handling + reply (AskForGeneral/Choice/
// SkillInvoke). Verifies the notify→state and resolve→reply shapes.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePopupStore } from '../src/stores/popupStore.js'

beforeEach(() => { usePopupStore.getState().clear(); usePopupStore.setState({ replySender: undefined }) })

describe('popupStore', () => {
  it('AskForGeneral → general popup; resolve replies with chosen names array', () => {
    const sent: unknown[] = []
    usePopupStore.getState().setReplySender((d) => sent.push(d))
    const handled = usePopupStore.getState().handle('AskForGeneral', [['caocao', 'liubei', 'sunquan'], 1, false, false, '', {}])
    expect(handled).toBe(true)
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('general')
    expect(a.generals).toEqual(['caocao', 'liubei', 'sunquan'])
    expect(a.count).toBe(1)
    usePopupStore.getState().resolve(['caocao'])
    expect(sent).toEqual([['caocao']])
    expect(usePopupStore.getState().active).toBeNull()
  })

  it('AskForChoice → choice popup; resolve replies with the chosen value', () => {
    const sent: unknown[] = []
    usePopupStore.getState().setReplySender((d) => sent.push(d))
    usePopupStore.getState().handle('AskForChoice', [['弃牌', '不弃'], ['discard', 'keep'], 'someskill', '请选择', false])
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('choice')
    expect(a.options).toEqual(['弃牌', '不弃'])
    expect(a.values).toEqual(['discard', 'keep'])
    usePopupStore.getState().resolve('discard')
    expect(sent).toEqual(['discard'])
  })

  it('AskForSkillInvoke → yes/no; resolve "1"/"__cancel"', () => {
    const sent: unknown[] = []
    usePopupStore.getState().setReplySender((d) => sent.push(d))
    usePopupStore.getState().handle('AskForSkillInvoke', ['jianxiong', '是否发动奸雄?'])
    expect(usePopupStore.getState().active!.kind).toBe('skillInvoke')
    usePopupStore.getState().resolve('1')
    expect(sent).toEqual(['1'])
  })

  it('ignores non-popup commands', () => {
    expect(usePopupStore.getState().handle('MoveCards', { merged: [] })).toBe(false)
    expect(usePopupStore.getState().active).toBeNull()
  })
})
