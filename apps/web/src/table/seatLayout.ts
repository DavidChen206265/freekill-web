// seatLayout.ts — seat coordinates, ported line-by-line from the QML client's
// RoomLogic.js arrangePhotos()/arrangeManyPhotos(). The QML stage is a fixed
// 1200×540 logical canvas (main.qml), so these formulas transfer directly to a
// DOM fixed-stage (plan §5.1). Coordinates are top-left of each Photo, in logical
// stage pixels.
//
// `relativeSeat` is the seat index RELATIVE to self (self = 0, then clockwise).
// regularSeatIndex maps relativeSeat -> region slot for each player count.

const PHOTO_BASE_WIDTH = 175 * 0.75 // 131.25

export interface SeatPos {
  x: number
  y: number
  scale: number
}

export interface StageDims {
  /** roomScene logical size (main.qml: 1200×540). */
  sceneWidth: number
  sceneHeight: number
  /** dashboard height (content-driven in QML; ~150 typical). roomArea height
   *  = sceneHeight - dashboardHeight + 20. */
  dashboardHeight: number
}

export const DEFAULT_STAGE: StageDims = { sceneWidth: 1200, sceneHeight: 540, dashboardHeight: 150 }

const regularSeatIndex: number[][] = [
  [0],
  [0, 4],
  [0, 3, 5],
  [0, 1, 4, 7],
  [0, 1, 3, 5, 7],
  [0, 1, 3, 4, 5, 7],
  [0, 1, 2, 3, 5, 6, 7],
  [0, 1, 2, 3, 4, 5, 6, 7],
]

// arrangePhotos: 1..8 players. Returns region coordinates for the 8 slots, then
// callers pick regions[seatIndex[relativeSeat]].
function regions8(stage: StageDims): { x: number; y: number }[] {
  const roomScene = { width: stage.sceneWidth, height: stage.sceneHeight }
  const photoWidth = PHOTO_BASE_WIDTH
  const verticalPadding = 0
  const verticalSpacing = roomScene.height * 0.08
  const horizontalSpacing = (roomScene.width - photoWidth * 7) / 8
  const startX = verticalPadding + horizontalSpacing
  const padding = photoWidth + horizontalSpacing
  return [
    { x: startX + padding * 6, y: roomScene.height - 192 },
    { x: startX + padding * 6, y: 16 + verticalSpacing * 3 },
    { x: startX + padding * 5, y: 16 + verticalSpacing },
    { x: startX + padding * 4, y: 16 },
    { x: startX + padding * 3, y: 16 },
    { x: startX + padding * 2, y: 16 },
    { x: startX + padding, y: 16 + verticalSpacing },
    { x: startX, y: 16 + verticalSpacing * 3 },
  ]
}

/**
 * Seat position for a player at `relativeSeat` (0 = self at bottom) in a game of
 * `playerNum` players. For >8 players use arrangeMany (not yet ported — basic
 * games are ≤8).
 */
export function seatPosition(relativeSeat: number, playerNum: number, stage: StageDims = DEFAULT_STAGE): SeatPos {
  const regions = regions8(stage)
  const seatIndex = regularSeatIndex[playerNum - 1] ?? regularSeatIndex[7]!
  const slot = seatIndex[relativeSeat] ?? 0
  const region = regions[slot] ?? regions[0]!
  return { x: region.x, y: region.y, scale: 1 }
}

/** Convert an absolute seat number (1-based, from ArrangeSeats) + self's seat to
 *  a relative seat (0 = self), clockwise. */
export function toRelativeSeat(absSeat: number, selfSeat: number, playerNum: number): number {
  return ((absSeat - selfSeat) % playerNum + playerNum) % playerNum
}
