// popupStore unit tests — popup-request handling + reply (AskForGeneral/Choice/
// SkillInvoke). Verifies the notify→state and resolve→reply shapes.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePopupStore, shuffleInvisibleOutput, shuffleInvisiblePoxi } from '../src/stores/popupStore.js'

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

  it('AG flow: FillAG lays out, AskForAG prompts, TakeAG tags (keeps) the card, CloseAG closes', () => {
    const st = usePopupStore.getState()
    st.handle('FillAG', [[1, 2, 3]])
    // FillAG lays out the pile but it is NOT interactive yet (RoomLogic.js:1462).
    expect(usePopupStore.getState().active!.agCards).toEqual([{ cid: 1 }, { cid: 2 }, { cid: 3 }])
    expect(usePopupStore.getState().active!.agInteractive).toBe(false)
    st.handle('AskForAG', {})
    expect(usePopupStore.getState().active!.prompt).toContain('选择')
    expect(usePopupStore.getState().active!.agInteractive).toBe(true)
    st.handle('TakeAG', [2, 2]) // player 2 took card 2 — kept in place, tagged taken
    const ag = usePopupStore.getState().active!.agCards!
    expect(ag.map((c) => c.cid)).toEqual([1, 2, 3])
    expect(ag.find((c) => c.cid === 2)!.takenBy).toBeTruthy()
    expect(ag.find((c) => c.cid === 1)!.takenBy).toBeUndefined()
    st.handle('CloseAG', {})
    expect(usePopupStore.getState().active).toBeNull()
  })

  it('AG box survives clearExceptAg (CancelRequest fires before every AskFor*)', () => {
    // The VM emits notifyUI("CancelRequest") before EVERY AskFor* command
    // (client.lua:48-49), so it lands between FillAG and the AskForAG that activates
    // the pile. A blanket clear() would wipe the box before AskForAG can mutate it.
    const st = usePopupStore.getState()
    st.handle('FillAG', [[5, 6]])
    expect(usePopupStore.getState().active!.kind).toBe('ag')
    st.clearExceptAg() // the CancelRequest that precedes AskForAG
    expect(usePopupStore.getState().active).not.toBeNull()
    expect(usePopupStore.getState().active!.kind).toBe('ag')
    st.handle('AskForAG', {})
    expect(usePopupStore.getState().active!.agInteractive).toBe(true)
  })

  it('clearExceptAg closes a NON-AG popup (regular cancel behavior)', () => {
    const st = usePopupStore.getState()
    st.handle('AskForChoice', [['弃牌'], ['discard'], 'sk', '请选择', false])
    expect(usePopupStore.getState().active!.kind).toBe('choice')
    st.clearExceptAg()
    expect(usePopupStore.getState().active).toBeNull()
  })

  it('resolveAg replies the cid but KEEPS the box open + locked until CloseAG', () => {
    // AG.qml onClicked: reply cid, interactive=false, but the box stays (only CloseAG
    // closes it) so the player still sees the subsequent TakeAG tags.
    const sent: unknown[] = []
    const st = usePopupStore.getState()
    st.setReplySender((d) => sent.push(d))
    st.handle('FillAG', [[7, 8]])
    st.handle('AskForAG', {})
    usePopupStore.getState().resolveAg(7)
    expect(sent).toEqual([7])
    const a = usePopupStore.getState().active
    expect(a).not.toBeNull()
    expect(a!.kind).toBe('ag')
    expect(a!.agInteractive).toBe(false) // no longer clickable after picking
    usePopupStore.getState().handle('CloseAG', {})
    expect(usePopupStore.getState().active).toBeNull()
  })

  it('AskForGuanxing → arrange areas (top/bottom), cards pre-placed per card_map', () => {
    // cards is a 2D card_map [top, bottom] (room.lua:1811-1817); rows pre-place.
    usePopupStore.getState().handle('AskForGuanxing', {
      cards: [[1, 2], [3]], max_top_cards: 2, min_top_cards: 0, max_bottom_cards: 3, min_bottom_cards: 0,
      top_area_name: '牌堆顶', bottom_area_name: '牌堆底', prompt: '观星', is_free: true,
    })
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('arrange')
    expect(a.areas).toHaveLength(2)
    expect(a.areas![0]!.capacity).toBe(2)
    // Pre-placed: top=[1,2], bottom=[3] — "do nothing → 确定" keeps the dealt order.
    expect(a.initialSlots).toEqual([[1, 2], [3]])
    expect(a.arrangeCards).toEqual([1, 2, 3])
  })

  it('AskForExchange → one area per non-empty pile, pre-placed', () => {
    usePopupStore.getState().handle('AskForExchange', { piles: [[1, 2], [], [3]], piles_name: ['手牌', '空', '装备'] })
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('arrange')
    expect(a.areas).toHaveLength(2) // empty pile skipped
    expect(a.initialSlots).toEqual([[1, 2], [3]])
  })

  it('AskForArrangeCards → pre-placed by area; is_free=false locks area-0 cards', () => {
    usePopupStore.getState().handle('AskForArrangeCards', {
      cards: [[1, 2], [3, 4]], capacities: [2, 2], limits: [0, 0], names: ['A', 'B'],
      is_free: false, prompt: '排列',
    })
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('arrange')
    expect(a.initialSlots).toEqual([[1, 2], [3, 4]])
    expect(a.isFree).toBe(false) // ArrangeBox will lock area-0 cards [1,2]
  })

  it('AskForArrangeCards preserves poxi_type for shzl shelie-style arrange rules', () => {
    usePopupStore.getState().handle('AskForArrangeCards', {
      cards: [[1, 2, 3, 4, 5], []],
      capacities: [5, 4],
      limits: [0, 3],
      names: ['shelie', 'toObtain'],
      is_free: false,
      prompt: '#shelie-choose',
      poxi_type: 'shelie',
    })
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('arrange')
    expect(a.arrangePoxiType).toBe('shelie')
    expect(a.areas?.map((x) => x.name)).toEqual(['shelie', 'toObtain'])
  })

  it('EmptyRequest is handled (no popup)', () => {
    expect(usePopupStore.getState().handle('EmptyRequest', null)).toBe(true)
  })

  it('AskForPoxi → poxi popup with real rule payload (not min0..maxAll downgrade)', () => {
    // M4 I-1: keep poxi_type/data/extra_data so PoxiBox can call vm.poxi{Filter,
    // Feasible,Prompt}; do NOT collapse to a generic min..max card pick.
    const handled = usePopupStore.getState().handle('AskForPoxi', {
      type: 'AskForCardsChosen',
      data: [['$Hand', [1, 2, 3]]],
      extra_data: { min: 1, max: 2, visible_data: { '2': false } },
      cancelable: true,
    })
    expect(handled).toBe(true)
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('poxi')
    expect(a.poxiType).toBe('AskForCardsChosen')
    expect(a.poxiData).toEqual([['$Hand', [1, 2, 3]]])
    expect(a.cancelable).toBe(true)
    // groups parsed for rendering; card 2 is face-down (visible_data false).
    const grp = a.groups![0]!
    expect(grp.cards.find((c) => c.cid === 2)!.known).toBe(false)
    expect(grp.cards.find((c) => c.cid === 1)!.known).toBe(true)
  })

  it('AskForCardsAndChoice → cardsAndChoice popup; resolve replies {cards,choice}', () => {
    const sent: unknown[] = []
    usePopupStore.getState().setReplySender((d) => sent.push(d))
    const handled = usePopupStore.getState().handle('AskForCardsAndChoice', {
      cards: [1, 2, 3], choices: ['确定'], cancel_choices: ['取消'],
      prompt: '弃牌', min: 1, max: 2, disabled: [3], filter_skel: '', extra_data: {},
    })
    expect(handled).toBe(true)
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('cardsAndChoice')
    expect(a.ccCards).toEqual([1, 2, 3])
    expect(a.ccDisabled).toEqual([3])
    expect(a.ccOkOptions).toEqual(['确定'])
    expect(a.ccCancelOptions).toEqual(['取消'])
    expect(a.min).toBe(1)
    expect(a.max).toBe(2)
    usePopupStore.getState().resolve({ cards: [1], choice: '确定' })
    expect(sent).toEqual([{ cards: [1], choice: '确定' }])
    expect(usePopupStore.getState().active).toBeNull()
  })

  it('AskForMoveCardInBoard → moveBoard popup; resolve replies {cardId,pos}', () => {
    const sent: unknown[] = []
    usePopupStore.getState().setReplySender((d) => sent.push(d))
    const handled = usePopupStore.getState().handle('AskForMoveCardInBoard', {
      cards: [11, 22], cardsPosition: [0, 1], generalNames: ['caocao', 'liubei'], playerIds: [1, 2],
    })
    expect(handled).toBe(true)
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('moveBoard')
    expect(a.mbCards).toEqual([11, 22])
    expect(a.mbPositions).toEqual([0, 1])
    expect(a.mbSideNames).toEqual(['caocao', 'liubei'])
    // Reply carries the card's ORIGINAL position (pos), not the previewed side.
    usePopupStore.getState().resolve({ cardId: 11, pos: 0 })
    expect(sent).toEqual([{ cardId: 11, pos: 0 }])
    expect(usePopupStore.getState().active).toBeNull()
  })

  it('CustomDialog / MiniGame → unsupported popup that cancels (no timer stall)', () => {
    const sent: unknown[] = []
    usePopupStore.getState().setReplySender((d) => sent.push(d))
    for (const cmd of ['CustomDialog', 'MiniGame']) {
      usePopupStore.getState().clear()
      sent.length = 0
      const handled = usePopupStore.getState().handle(cmd, { type: 'x', data: {} })
      expect(handled).toBe(true)
      const a = usePopupStore.getState().active!
      expect(a.kind).toBe('unsupported')
      usePopupStore.getState().resolve('__cancel')
      expect(sent).toEqual(['__cancel'])
      expect(usePopupStore.getState().active).toBeNull()
    }
  })

  it('CustomDialog ChooseSkillBox → chooseSkill popup, replies selected skill array (M5-b)', () => {
    // sp xiaode: askToCustomDialog{qml_path=ChooseSkillBox, extra_data={skills,0,1,prompt}}.
    const sent: unknown[] = []
    usePopupStore.getState().setReplySender((d) => sent.push(d))
    const handled = usePopupStore.getState().handle('CustomDialog', {
      path: 'packages/utility/qml/ChooseSkillBox.qml',
      data: [['rende', 'wusheng', 'paoxiao'], 0, 1, '#xiaode-invoke::5'],
    })
    expect(handled).toBe(true)
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('chooseSkill')
    expect(a.csSkills).toEqual(['rende', 'wusheng', 'paoxiao'])
    expect(a.min).toBe(0)
    expect(a.max).toBe(1)
    expect(a.cancelable).toBe(true) // min 0 → cancelable
    // resolve with a picked skill → reply is the selected skill-name array
    usePopupStore.getState().resolve(['wusheng'])
    expect(sent).toEqual([['wusheng']])
    expect(usePopupStore.getState().active).toBeNull()
  })

  it('shuffleInvisiblePoxi: visible picks pass through, invisible picks randomized within area', () => {
    // group A: 1,2 visible; 3,4 invisible. group B: 5 visible.
    const groups = [
      { name: 'A', cards: [{ cid: 1, known: true }, { cid: 2, known: true }, { cid: 3, known: false }, { cid: 4, known: false }] },
      { name: 'B', cards: [{ cid: 5, known: true }] },
    ]
    // Pick a visible (1) and an invisible (3). rng→0 picks the first invisible in pool.
    const out = shuffleInvisiblePoxi(groups, [1, 3], () => 0)
    expect(out[0]).toBe(1)            // visible passes through unchanged, same slot
    expect([3, 4]).toContain(out[1])  // invisible replaced by SOME invisible from area A
    // All-visible selection is identity.
    expect(shuffleInvisiblePoxi(groups, [1, 5], () => 0.99)).toEqual([1, 5])
    // Two invisible picks from the same area get DISTINCT outputs (splice, no repeat).
    const both = shuffleInvisiblePoxi(groups, [3, 4], () => 0)
    expect(new Set(both).size).toBe(2)
    expect(both.every((c) => [3, 4].includes(c))).toBe(true)
  })
})
