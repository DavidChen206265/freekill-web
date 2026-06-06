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
  // monotonically increasing; bumped each MoveCards so the anim layer can react
  moveSeq: number
  // the cards that moved in the last MoveCards (for the animation layer)
  lastMoved: { cid: number; from: AreaKey; to: AreaKey }[]
  applyMoveCards: (visibleData: unknown) => void
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

function asMoves(visibleData: unknown): { merged: MoveInfo[]; vis: Record<string, boolean> } {
  const vd = visibleData as Record<string, unknown>
  const merged = Array.isArray(vd?.merged) ? (vd.merged as MoveInfo[]) : []
  // The top-level numeric-string keys are per-cid visibility flags.
  const vis: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(vd ?? {})) {
    if (/^\d+$/.test(k)) vis[k] = !!v
  }
  return { merged, vis }
}

export const useCardStore = create<CardState>((set, get) => ({
  areas: { drawPile: [], tablePile: [] },
  known: {},
  moveSeq: 0,
  lastMoved: [],

  applyMoveCards: (visibleData) => {
    const { merged, vis } = asMoves(visibleData)
    set((s) => {
      const areas: Record<AreaKey, number[]> = { ...s.areas }
      const known = { ...s.known }
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
          if (actualFrom) areas[actualFrom] = areas[actualFrom]!.filter((x) => x !== cid)
          // Void = card leaves play; don't add anywhere.
          if (move.toArea !== CardArea.Void) areas[toKey]!.push(cid)
          if (cid !== -1 && vis[String(cid)] !== undefined) known[cid] = vis[String(cid)]!
          moved.push({ cid, from: actualFrom ?? 'drawPile', to: toKey })
        }
      }
      return { areas, known, moveSeq: s.moveSeq + 1, lastMoved: moved }
    })
  },

  reset: () => set({ areas: { drawPile: [], tablePile: [] }, known: {}, moveSeq: 0, lastMoved: [] }),
}))
