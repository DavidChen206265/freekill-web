// cardStore.ts — card locations + move events, fed by the VM's notifyUI("MoveCards").
//
// The VM emits visible_data = { merged: Move[], event_id, [cid]: boolean }, where
// each Move = { ids[], from, to, fromArea, toArea, moveReason, specialName, ... }
// and [cid]:bool is per-card visibility (known → front face). This is a verbatim
// port of RoomLogic.js moveCards()/getAreaItem() (lines 166-222): we compute each
// card's destination AREA here; the animation layer (CardAnimLayer) does the
// flight using DOM rects. cardStore owns WHERE cards are; it does not animate.

import { create } from 'zustand'

// Card area codes (RoomLogic.js:5-14).
export const CardArea = {
  Unknown: 0,
  PlayerHand: 1,
  PlayerEquip: 2,
  PlayerJudge: 3,
  PlayerSpecial: 4,
  Processing: 5,
  DrawPile: 6,
  DiscardPile: 7,
  Void: 8,
  AG: 9,
} as const

// A logical area key in our DOM (data-area). Player areas are suffixed by pid.
// tablePile holds Processing/DiscardPile/Void (RoomLogic getAreaItem:169-171).
export type AreaKey = string // e.g. "drawPile", "tablePile", "hand:3", "equip:3", "judge:3"

export interface MoveInfo {
  ids: number[]
  from: number
  to: number
  fromArea: number
  toArea: number
  moveReason?: number
  specialName?: string
}

export interface CardLoc {
  cid: number
  area: AreaKey
  known: boolean // front face if true
}

interface CardState {
  // area key -> ordered card ids
  areas: Record<AreaKey, number[]>
  // cid -> known (face up)
  known: Record<number, boolean>
  // cid -> holding_event_id (for table cards; drives Destroy*ByEvent cleanup)
  eventIds: Record<number, number>
  // monotonically increasing; bumped each MoveCards so the anim layer can react
  moveSeq: number
  // the cards that moved in the last MoveCards (for the animation layer)
  lastMoved: { cid: number; from: AreaKey; to: AreaKey }[]
  applyMoveCards: (visibleData: unknown) => void
  /** Clear the accumulated move buffer after CardLayer consumes it for flights. */
  clearLastMoved: () => void
  // Remove specific cards from the table pile (DestroyTableCard — by cid list).
  destroyTableCards: (cids: number[]) => void
  // Remove table cards whose holding_event_id >= threshold (DestroyTableCardByEvent).
  destroyTableCardsByEvent: (eventThreshold: number) => void
  // Vanish pass: actually remove table cards marked vanishable (event id 0). Driven
  // by a ~1.5s timer in CardLayer (mirrors TablePile.qml vanishTimer).
  vanishTableCards: () => void
  reset: () => void
}

// Resolve a (area code, playerId) to our DOM area key. Mirrors getAreaItem.
function areaKey(area: number, playerId: number): AreaKey | null {
  switch (area) {
    case CardArea.DrawPile: return 'drawPile'
    case CardArea.DiscardPile:
    case CardArea.Processing:
    case CardArea.Void: return 'tablePile'
    case CardArea.AG: return 'tablePile' // popup AG not modeled yet → tablePile
    case CardArea.PlayerHand: return `hand:${playerId}`
    case CardArea.PlayerEquip: return `equip:${playerId}`
    case CardArea.PlayerJudge: return `judge:${playerId}`
    case CardArea.PlayerSpecial: return `special:${playerId}`
    default: return null
  }
}

function asMoves(visibleData: unknown): { merged: MoveInfo[]; vis: Record<string, boolean>; eventId: number } {
  const vd = visibleData as Record<string, unknown>
  const merged = Array.isArray(vd?.merged) ? (vd.merged as MoveInfo[]) : []
  const eventId = typeof vd?.event_id === 'number' ? vd.event_id : Number(vd?.event_id ?? 0) || 0
  // The top-level numeric-string keys are per-cid visibility flags.
  const vis: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(vd ?? {})) {
    if (/^\d+$/.test(k)) vis[k] = !!v
  }
  return { merged, vis, eventId }
}

export const useCardStore = create<CardState>((set, get) => ({
  areas: { drawPile: [], tablePile: [] },
  known: {},
  eventIds: {},
  moveSeq: 0,
  lastMoved: [],

  applyMoveCards: (visibleData) => {
    const { merged, vis, eventId } = asMoves(visibleData)
    set((s) => {
      const areas: Record<AreaKey, number[]> = { ...s.areas }
      const known = { ...s.known }
      const eventIds = { ...s.eventIds }
      const moved: { cid: number; from: AreaKey; to: AreaKey }[] = []
      const ensure = (k: AreaKey) => { if (!areas[k]) areas[k] = [] }

      for (const move of merged) {
        const toKey = areaKey(move.toArea, move.to)
        if (!toKey) continue
        ensure(toKey)
        for (const cid of move.ids) {
          // Find current area (RoomLogic uses fromArea; we also scan as fallback).
          const fromKey = areaKey(move.fromArea, move.from)
          let actualFrom: AreaKey | null = fromKey && areas[fromKey]?.includes(cid) ? fromKey : null
          if (!actualFrom) {
            for (const [k, ids] of Object.entries(areas)) {
              if (ids.includes(cid)) { actualFrom = k; break }
            }
          }
          // QML moveCards SKIP guard (RoomLogic.js:200): a move within the SAME area
          // (other than tablePile) is a no-op; and Processing→DiscardPile (both map to
          // tablePile) is SKIPPED so the card KEEPS its on-table slot — it's not pulled
          // out and re-appended (which would reorder the row + jump cards around). The
          // vanishTimer removes it later. Without this, discarding a played card jumped
          // it to the end of the row and re-centred everything ("加入顺序混乱").
          const sameArea = actualFrom !== null && actualFrom === toKey
          const procToDiscard = actualFrom === 'tablePile' && move.toArea === CardArea.DiscardPile
          if ((sameArea && toKey !== 'tablePile') || procToDiscard) {
            // still refresh visibility + event id, but DON'T move the card in the array
            if (cid !== -1 && vis[String(cid)] !== undefined) known[cid] = vis[String(cid)]!
            continue
          }
          if (actualFrom) areas[actualFrom] = areas[actualFrom]!.filter((x) => x !== cid)
          // Void = card leaves play; don't add anywhere.
          if (move.toArea !== CardArea.Void) areas[toKey]!.push(cid)
          if (cid !== -1 && vis[String(cid)] !== undefined) known[cid] = vis[String(cid)]!
          // Track holding_event_id for table cards (RoomLogic.js:205) so the
          // Destroy*ByEvent cleanup can find them; clear it when leaving the table.
          if (toKey === 'tablePile') eventIds[cid] = eventId
          else delete eventIds[cid]
          moved.push({ cid, from: actualFrom ?? 'drawPile', to: toKey })
        }
      }
      // ACCUMULATE across moves: several MoveCards can fire in one feed/React batch
      // (e.g. draw 2 + play a card on the same turn-start). The CardLayer flight
      // effect runs ONCE after the batch, so if we replaced lastMoved each call only
      // the final move's source survived → earlier cards (e.g. the drawn ones) lost
      // their fly-from origin and popped in. Keep the latest entry PER cid; CardLayer
      // clears the buffer after consuming it.
      const byCid = new Map<number, { cid: number; from: AreaKey; to: AreaKey }>()
      for (const m of s.lastMoved) byCid.set(m.cid, m)
      for (const m of moved) byCid.set(m.cid, m)
      return { areas, known, eventIds, moveSeq: s.moveSeq + 1, lastMoved: [...byCid.values()] }
    })
  },

  // CardLayer calls this after its flight effect consumes lastMoved, so the next
  // batch starts fresh (origins aren't re-applied to already-settled cards).
  clearLastMoved: () => set((s) => (s.lastMoved.length ? { lastMoved: [] } : {})),

  destroyTableCards: (cids) => {
    // DestroyTableCard (RoomLogic.js:548-556): does NOT remove the card — only clears
    // its holding_event_id (sets to 0), marking it vanishable. Removing immediately
    // "will cause animation errors" (QML comment) — instant cards (无中生有/响应/延时
    // 锦囊) move hand→table→here in one batch, so immediate removal kills the flight.
    // The vanish pass (vanishTableCards, ~1.5s like TablePile.qml vanishTimer) removes
    // them later, giving the fly-in time to play + the card to linger on the table.
    set((s) => {
      const cset = new Set(cids)
      const eventIds = { ...s.eventIds }
      for (const c of s.areas.tablePile ?? []) if (cset.has(c)) eventIds[c] = 0
      return { eventIds }
    })
  },

  destroyTableCardsByEvent: (eventThreshold) => {
    // DestroyTableCardByEvent (RoomLogic.js:558-566): clear holding_event_id for table
    // cards whose id >= threshold (mark vanishable), DON'T remove now (see above).
    set((s) => {
      const eventIds = { ...s.eventIds }
      for (const c of s.areas.tablePile ?? []) {
        if ((eventIds[c] ?? 0) >= eventThreshold) eventIds[c] = 0
      }
      return { eventIds }
    })
  },

  // The vanish pass (TablePile.qml vanishTimer, ~1.5s cycle): remove table cards whose
  // holding_event_id is 0 (cleared by a Destroy* above) AND that have a known cid.
  // Returns nothing; CardLayer drives this on a timer so flights finish + cards linger.
  vanishTableCards: () => {
    set((s) => {
      const table = s.areas.tablePile ?? []
      const keep = table.filter((c) => (s.eventIds[c] ?? 0) !== 0)
      if (keep.length === table.length) return {}
      const eventIds = { ...s.eventIds }
      for (const c of table) if ((eventIds[c] ?? 0) === 0) delete eventIds[c]
      return { areas: { ...s.areas, tablePile: keep }, eventIds, moveSeq: s.moveSeq + 1 }
    })
  },

  reset: () => set({ areas: { drawPile: [], tablePile: [] }, known: {}, eventIds: {}, moveSeq: 0, lastMoved: [] }),
}))
