// areas.ts — logical geometry of card areas on the 1200×540 stage. Ported from
// Room.qml (drawPile/tablePile) + Photo sub-areas. The animation layer reads the
// live DOM rect of each area (by data-area), so these are just anchor boxes; the
// exact within-area card layout is handled by ItemArea-style positioning.

import { STAGE_W, STAGE_H } from './Stage.js'
import { seatPosition, PHOTO_WIDTH, PHOTO_HEIGHT } from './seatLayout.js'

export interface Box { x: number; y: number; w: number; h: number }

// drawPile: Room.qml x=w/2, y=h/2 (a point — cards stack at center).
export const DRAW_PILE: Box = { x: STAGE_W / 2 - 35, y: STAGE_H / 2 - 50, w: 70, h: 100 }
// tablePile: Room.qml x=0.15w, y=0.6h+10, w=0.7w, h=150 (the play/discard strip).
export const TABLE_PILE: Box = { x: STAGE_W * 0.15, y: STAGE_H * 0.6 + 10, w: STAGE_W * 0.7, h: 150 }

// Per-player sub-areas, anchored to that player's Photo box (by display index).
// Equip/judge/hand-of-others sit relative to the photo; self hand is the dashboard.
export function playerAreaBox(kind: 'hand' | 'equip' | 'judge' | 'special', index: number, playerNum: number, isSelf: boolean): Box {
  if (kind === 'hand' && isSelf) {
    // self hand = dashboard strip along the bottom.
    return { x: 60, y: STAGE_H - 96, w: STAGE_W - 320, h: 96 }
  }
  const p = seatPosition(index, playerNum)
  const px = p.x
  const py = p.y
  switch (kind) {
    case 'hand': // others' hand: small marker near the photo (back faces)
      return { x: px + PHOTO_WIDTH - 10, y: py + PHOTO_HEIGHT - 30, w: 30, h: 30 }
    case 'equip': // Photo equip area ~ lower band of the photo
      return { x: px + 4, y: py + PHOTO_HEIGHT * 0.55, w: PHOTO_WIDTH - 8, h: PHOTO_HEIGHT * 0.3 }
    case 'judge': // delayed tricks ~ bottom strip of the photo
      return { x: px, y: py + PHOTO_HEIGHT - 24, w: PHOTO_WIDTH, h: 24 }
    case 'special':
      return { x: px, y: py + PHOTO_HEIGHT, w: PHOTO_WIDTH, h: 20 }
  }
}

// Resolve an AreaKey ("drawPile"|"tablePile"|"hand:ID"|"equip:ID"|...) to a Box,
// given the players' display indexes. Returns null if unknown.
export function resolveAreaBox(
  key: string,
  playerIndex: (pid: number) => { index: number; isSelf: boolean } | null,
  playerNum: number,
): Box | null {
  if (key === 'drawPile') return DRAW_PILE
  if (key === 'tablePile') return TABLE_PILE
  const [kind, idStr] = key.split(':')
  const pid = Number(idStr)
  const pi = playerIndex(pid)
  if (!pi || !kind) return null
  if (kind === 'hand' || kind === 'equip' || kind === 'judge' || kind === 'special') {
    return playerAreaBox(kind, pi.index, playerNum, pi.isSelf)
  }
  return null
}

export const CARD_W = 70
export const CARD_H = 100
