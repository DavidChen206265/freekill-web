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

  it('DestroyTableCard marks cards vanishable; vanishTableCards removes them later', () => {
    const cs = useCardStore.getState()
    // play two cards onto the table (event_id 5)
    cs.applyMoveCards({ merged: [{ ids: [5], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.Processing }], event_id: 5, '5': true })
    cs.applyMoveCards({ merged: [{ ids: [6], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.Processing }], event_id: 5, '6': true })
    expect(useCardStore.getState().areas['tablePile']).toEqual([5, 6])
    // Destroy does NOT remove immediately (would kill the fly-in animation) — it only
    // marks the card vanishable (event id 0), like QML's holding_event_id=0.
    cs.destroyTableCards([5])
    expect(useCardStore.getState().areas['tablePile']).toEqual([5, 6])
    // The vanish pass removes the marked card; the still-held one stays.
    cs.vanishTableCards()
    expect(useCardStore.getState().areas['tablePile']).toEqual([6])
  })

  it('DestroyTableCardByEvent marks cards (id >= threshold) vanishable; vanish removes', () => {
    const cs = useCardStore.getState()
    cs.applyMoveCards({ merged: [{ ids: [7], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.Processing }], event_id: 3, '7': true })
    cs.applyMoveCards({ merged: [{ ids: [8], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.Processing }], event_id: 7, '8': true })
    // threshold 7 → marks cid 8 (eid 7) vanishable, keeps cid 7 (eid 3); not removed yet.
    cs.destroyTableCardsByEvent(7)
    expect(useCardStore.getState().areas['tablePile']).toEqual([7, 8])
    cs.vanishTableCards()
    expect(useCardStore.getState().areas['tablePile']).toEqual([7])
  })

  it('a card leaving the table clears its event id (no stale vanish)', () => {
    const cs = useCardStore.getState()
    cs.applyMoveCards({ merged: [{ ids: [9], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.Processing }], event_id: 4, '9': true })
    // card 9 picked up into a hand → leaves table, event id cleared
    cs.applyMoveCards({ merged: [{ ids: [9], from: 1, to: 2, fromArea: CardArea.Processing, toArea: CardArea.PlayerHand }], event_id: 0, '9': true })
    cs.destroyTableCardsByEvent(1) // should NOT affect card 9 (now in a hand)
    cs.vanishTableCards()
    expect(useCardStore.getState().areas['hand:2']).toContain(9)
  })

  it('lastMoved records the source area so the anim layer can fly the card in', () => {
    // A card used by player 3 (in their hand) goes to the table. CardLayer relies on
    // lastMoved[].from = "hand:3" to seed the flight start at the owner's photo (the
    // card was never rendered before, so without this it would pop into the centre).
    const cs = useCardStore.getState()
    // first put the card into player 3's hand (tracked even though not rendered)
    cs.applyMoveCards({ merged: [{ ids: [20], from: 0, to: 3, fromArea: CardArea.DrawPile, toArea: CardArea.PlayerHand }], event_id: 1, '20': true })
    // then player 3 uses it → Processing (table)
    cs.applyMoveCards({ merged: [{ ids: [20], from: 3, to: 1, fromArea: CardArea.PlayerHand, toArea: CardArea.Processing }], event_id: 2, '20': true })
    const moved = useCardStore.getState().lastMoved
    expect(moved).toEqual([{ cid: 20, from: 'hand:3', to: 'tablePile' }])
  })

  it('lastMoved ACCUMULATES across batched moves (draw 2 + play in one batch)', () => {
    // Several MoveCards fire before CardLayer's flight effect runs once. Without
    // accumulation the earlier move (the draw) lost its origin and the drawn cards
    // popped in with no fly animation. Keep the latest entry per cid across the batch.
    const cs = useCardStore.getState()
    cs.applyMoveCards({ merged: [{ ids: [30, 31], from: 0, to: 1, fromArea: CardArea.DrawPile, toArea: CardArea.PlayerHand }], event_id: 1, '30': true, '31': true })
    cs.applyMoveCards({ merged: [{ ids: [32], from: 0, to: 1, fromArea: CardArea.PlayerHand, toArea: CardArea.Processing }], event_id: 2, '32': true })
    const moved = useCardStore.getState().lastMoved
    // all three cids retained (drawn 30/31 from drawPile + played 32 to table)
    expect(moved.find((m) => m.cid === 30)?.from).toBe('drawPile')
    expect(moved.find((m) => m.cid === 31)?.from).toBe('drawPile')
    expect(moved.find((m) => m.cid === 32)?.to).toBe('tablePile')
    // clearLastMoved empties it for the next batch
    cs.clearLastMoved()
    expect(useCardStore.getState().lastMoved).toEqual([])
  })
})
