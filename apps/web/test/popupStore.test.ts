// popupStore unit tests — popup-request handling + reply (AskForGeneral/Choice/
// SkillInvoke). Verifies the notify→state and resolve→reply shapes.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePopupStore, shuffleInvisibleOutput } from '../src/stores/popupStore.js'

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

  it('AskForSkillInvoke is NOT a popup (handled by ui_emu / InteractionBar)', () => {
    expect(usePopupStore.getState().handle('AskForSkillInvoke', ['jianxiong', '是否发动奸雄?'])).toBe(false)
    expect(usePopupStore.getState().active).toBeNull()
  })

  it('ignores non-popup commands', () => {
    expect(usePopupStore.getState().handle('MoveCards', { merged: [] })).toBe(false)
    expect(usePopupStore.getState().active).toBeNull()
  })

  it('AskForChoices → multi-select with min/max', () => {
    usePopupStore.getState().handle('AskForChoices', [['A', 'B', 'C'], ['a', 'b', 'c'], [1, 2], false, 'sk', '选1-2项', false])
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('choices')
    expect(a.min).toBe(1); expect(a.max).toBe(2)
    expect(a.values).toEqual(['a', 'b', 'c'])
  })

  it('AskForCardChosen → single card pick (groups); known defaults true', () => {
    usePopupStore.getState().handle('AskForCardChosen', { _prompt: '选一张', _id: 3, card_data: [['手牌', [11, 12]], ['装备', [20]]] })
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('cards')
    expect(a.min).toBe(1); expect(a.max).toBe(1)
    expect(a.groups).toEqual([
      { name: '手牌', cards: [{ cid: 11, known: true }, { cid: 12, known: true }] },
      { name: '装备', cards: [{ cid: 20, known: true }] },
    ])
  })

  it('AskForCardChosen → visible_data hides cards (Snatch: target hand is backs)', () => {
    // hand cards invisible (you pick blind), equip visible — like 顺手牵羊/过河拆桥.
    usePopupStore.getState().handle('AskForCardChosen', {
      _prompt: '选一张', _id: 3, card_data: [['手牌', [11, 12]], ['装备', [20]]],
      visible_data: { '11': false, '12': false, '20': true },
    })
    const a = usePopupStore.getState().active!
    expect(a.groups![0]!.cards).toEqual([{ cid: 11, known: false }, { cid: 12, known: false }])
    expect(a.groups![1]!.cards).toEqual([{ cid: 20, known: true }])
  })

  it('shuffleInvisibleOutput: visible click replies the actual cid', () => {
    const groups = [{ name: '装备', cards: [{ cid: 20, known: true }] }]
    expect(shuffleInvisibleOutput(groups, 20, () => 0)).toBe(20)
  })

  it('shuffleInvisibleOutput: face-down click replies a random back from the SAME area', () => {
    // hand all backs (blind pick); clicking any returns one of the area's backs by rng.
    const groups = [
      { name: '手牌', cards: [{ cid: 11, known: false }, { cid: 12, known: false }, { cid: 13, known: false }] },
      { name: '装备', cards: [{ cid: 20, known: true }] },
    ]
    // rng→0 picks invisible[0]=11; rng→0.99 picks invisible[2]=13. The clicked cid (12)
    // does not leak — the reply is decided purely by rng over the area's back set.
    expect(shuffleInvisibleOutput(groups, 12, () => 0)).toBe(11)
    expect(shuffleInvisibleOutput(groups, 12, () => 0.99)).toBe(13)
    // a visible card in another area still replies as itself
    expect(shuffleInvisibleOutput(groups, 20, () => 0)).toBe(20)
  })

  it('AskForCardsChosen → multi card pick with _min/_max', () => {
    usePopupStore.getState().handle('AskForCardsChosen', { _prompt: '选牌', _min: 1, _max: 2, card_data: [['手牌', [5, 6, 7]]] })
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('cards'); expect(a.min).toBe(1); expect(a.max).toBe(2)
  })

  it('AG flow: FillAG lays out, AskForAG prompts, TakeAG removes, CloseAG closes', () => {
    const st = usePopupStore.getState()
    st.handle('FillAG', [[1, 2, 3]])
    expect(usePopupStore.getState().active!.agCards).toEqual([1, 2, 3])
    st.handle('AskForAG', {})
    expect(usePopupStore.getState().active!.prompt).toContain('选择')
    st.handle('TakeAG', [2, 2]) // player 2 took card 2
    expect(usePopupStore.getState().active!.agCards).toEqual([1, 3])
    st.handle('CloseAG', {})
    expect(usePopupStore.getState().active).toBeNull()
  })

  it('AskForGuanxing → arrange areas (top/bottom) with capacities', () => {
    usePopupStore.getState().handle('AskForGuanxing', {
      cards: [[1, 2, 3]], max_top_cards: 3, min_top_cards: 0, max_bottom_cards: 3, min_bottom_cards: 0,
      top_area_name: '牌堆顶', bottom_area_name: '牌堆底', prompt: '观星',
    })
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('arrange')
    expect(a.arrangeCards).toEqual([1, 2, 3])
    expect(a.areas).toHaveLength(2)
    expect(a.areas![0]!.capacity).toBe(3)
  })

  it('AskForExchange → one area per non-empty pile', () => {
    usePopupStore.getState().handle('AskForExchange', { piles: [[1, 2], [], [3]], piles_name: ['手牌', '空', '装备'] })
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('arrange')
    expect(a.arrangeCards).toEqual([1, 2, 3])
    expect(a.areas).toHaveLength(2) // empty pile skipped
  })

  it('EmptyRequest is handled (no popup)', () => {
    expect(usePopupStore.getState().handle('EmptyRequest', null)).toBe(true)
  })
})
