// cardStore unit tests — MoveCards reducer with the VM's `merged` shape.

import { describe, it, expect, beforeEach } from 'vitest'
import { useCardStore, CardArea } from '../src/stores/cardStore.js'

beforeEach(() => useCardStore.getState().reset())

describe('cardStore.applyMoveCards', () => {
  it('draws cards from drawPile to a player hand (DrawPile -> PlayerHand)', () => {
    // VM notifyUI shape: { merged: [...], event_id, [cid]: visibility }
    useCardStore.getState().applyMoveCards({
      merged: [{ ids: [97, 120], from: 0, to: 2, fromArea: CardArea.DrawPile, toArea: CardArea.PlayerHand }],
      event_id: 1,
      '97': true, '120': true,
    })
    const s = useCardStore.getState()
    expect(s.areas['hand:2']).toEqual([97, 120])
    expect(s.known[97]).toBe(true)
    expect(s.moveSeq).toBe(1)
    expect(s.lastMoved).toHaveLength(2)
  })

  it('plays a card from hand to tablePile (PlayerHand -> Processing)', () => {
    const cs = useCardStore.getState()
    cs.applyMoveCards({ merged: [{ ids: [5], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.PlayerHand }], '5': true })
    cs.applyMoveCards({ merged: [{ ids: [5], from: 1, to: 0, fromArea: CardArea.PlayerHand, toArea: CardArea.Processing }], '5': true })
    const s = useCardStore.getState()
    expect(s.areas['hand:1']).toEqual([]) // left hand
    expect(s.areas['tablePile']).toContain(5) // on the table
  })

  it('discards from tablePile to discard (Processing -> DiscardPile, both tablePile)', () => {
    const cs = useCardStore.getState()
    cs.applyMoveCards({ merged: [{ ids: [9], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.PlayerHand }], '9': true })
    cs.applyMoveCards({ merged: [{ ids: [9], from: 1, to: 0, fromArea: CardArea.PlayerHand, toArea: CardArea.DiscardPile }], '9': false })
    const s = useCardStore.getState()
    expect(s.areas['tablePile']).toContain(9)
    expect(s.known[9]).toBe(false) // became hidden
  })

  it('Void removes a card from play entirely', () => {
    const cs = useCardStore.getState()
    cs.applyMoveCards({ merged: [{ ids: [3], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.PlayerHand }], '3': true })
    cs.applyMoveCards({ merged: [{ ids: [3], from: 1, to: 0, fromArea: CardArea.PlayerHand, toArea: CardArea.Void }] })
    const s = useCardStore.getState()
    expect(s.areas['hand:1']).toEqual([])
    // not in any area
    const everywhere = Object.values(s.areas).flat()
    expect(everywhere).not.toContain(3)
  })

  it('equips a card (PlayerHand -> PlayerEquip)', () => {
    const cs = useCardStore.getState()
    cs.applyMoveCards({ merged: [{ ids: [50], from: 0, to: 2, fromArea: CardArea.DrawPile, toArea: CardArea.PlayerHand }], '50': true })
    cs.applyMoveCards({ merged: [{ ids: [50], from: 2, to: 2, fromArea: CardArea.PlayerHand, toArea: CardArea.PlayerEquip }], '50': true })
    const s = useCardStore.getState()
    expect(s.areas['equip:2']).toContain(50)
    expect(s.areas['hand:2']).toEqual([])
  })

  it('DestroyTableCard removes the given cids from the table pile', () => {
    const cs = useCardStore.getState()
    // play two cards onto the table (event_id 5)
    cs.applyMoveCards({ merged: [{ ids: [5], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.Processing }], event_id: 5, '5': true })
    cs.applyMoveCards({ merged: [{ ids: [6], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.Processing }], event_id: 5, '6': true })
    expect(useCardStore.getState().areas['tablePile']).toEqual([5, 6])
    cs.destroyTableCards([5])
    expect(useCardStore.getState().areas['tablePile']).toEqual([6])
  })

  it('DestroyTableCardByEvent removes cards with holding_event_id >= threshold', () => {
    const cs = useCardStore.getState()
    cs.applyMoveCards({ merged: [{ ids: [7], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.Processing }], event_id: 3, '7': true })
    cs.applyMoveCards({ merged: [{ ids: [8], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.Processing }], event_id: 7, '8': true })
    // threshold 7 → removes cid 8 (eid 7), keeps cid 7 (eid 3)
    cs.destroyTableCardsByEvent(7)
    expect(useCardStore.getState().areas['tablePile']).toEqual([7])
  })

  it('a card leaving the table clears its event id (no stale removal)', () => {
    const cs = useCardStore.getState()
    cs.applyMoveCards({ merged: [{ ids: [9], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.Processing }], event_id: 4, '9': true })
    // card 9 picked up into a hand → leaves table, event id cleared
    cs.applyMoveCards({ merged: [{ ids: [9], from: 1, to: 2, fromArea: CardArea.Processing, toArea: CardArea.PlayerHand }], event_id: 0, '9': true })
    cs.destroyTableCardsByEvent(1) // should NOT affect card 9 (now in a hand)
    expect(useCardStore.getState().areas['hand:2']).toContain(9)
  })
})
