// seatLayout.ts — seat coordinates, ported VERBATIM from the QML client's
// RoomLogic.js arrangePhotos() (plan §5.1: port line-by-line, don't reinvent).
//
// A photo's position is regions[seatIndex[photo.index]], where:
//   - `index` = 0-based DISPLAY slot (0 = self at bottom). Assigned by addPlayer
//     order in the waiting room, and recomputed by ArrangeSeats (rotate the seat
//     order so Self is first). See gameStore.
//   - regions[] = 8 fixed screen coordinates.
//   - seatIndex = regularSeatIndex[playerNum-1] maps display slot -> region.
// The QML stage is a fixed 1200×540 logical canvas, so these transfer directly.

const PHOTO_BASE_WIDTH = 175 * 0.75 // 131.25

export interface SeatPos { x: number; y: number }

export interface StageDims {
  sceneWidth: number
  sceneHeight: number
  /** dashboard height (content-driven in QML; ~150 typical). roomArea.height
   *  = sceneHeight - dashboardHeight + 20. */
  dashboardHeight: number
}

export const DEFAULT_STAGE: StageDims = { sceneWidth: 1200, sceneHeight: 540, dashboardHeight: 150 }

// regularSeatIndex[playerNum-1][displaySlot] -> region index (RoomLogic.js:116).
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

// The 8 fixed regions (RoomLogic.js:105). roomArea.height = sceneHeight -
// dashboardHeight + 20; regions reference roomScene.height and roomArea.height.
function regions8(stage: StageDims): SeatPos[] {
  const roomScene = { width: stage.sceneWidth, height: stage.sceneHeight }
  const roomArea = { width: stage.sceneWidth, height: stage.sceneHeight - stage.dashboardHeight + 20 }
  const photoWidth = PHOTO_BASE_WIDTH
  const roomAreaPadding = 16
  const verticalPadding = 0
  const verticalSpacing = roomArea.height * 0.08
  const horizontalSpacing = (roomArea.width - photoWidth * 7) / 8
  const startX = verticalPadding + horizontalSpacing
  const padding = photoWidth + horizontalSpacing
  return [
    { x: startX + padding * 6, y: roomScene.height - 192 },
    { x: startX + padding * 6, y: roomAreaPadding + verticalSpacing * 3 },
    { x: startX + padding * 5, y: roomAreaPadding + verticalSpacing },
    { x: startX + padding * 4, y: roomAreaPadding },
    { x: startX + padding * 3, y: roomAreaPadding },
    { x: startX + padding * 2, y: roomAreaPadding },
    { x: startX + padding, y: roomAreaPadding + verticalSpacing },
    { x: startX, y: roomAreaPadding + verticalSpacing * 3 },
  ]
}

/**
 * Screen position for a photo at display `index` (0 = self, bottom) in a game of
 * `playerNum` players. Direct port of RoomLogic.js:130-138.
 */
export function seatPosition(index: number, playerNum: number, stage: StageDims = DEFAULT_STAGE): SeatPos {
  const regions = regions8(stage)
  const seatIndex = regularSeatIndex[Math.min(playerNum, 8) - 1] ?? regularSeatIndex[7]!
  const slot = seatIndex[index] ?? 0
  return regions[slot] ?? regions[0]!
}

/** Photo logical dimensions (for centering / hit-testing). */
export const PHOTO_WIDTH = PHOTO_BASE_WIDTH
export const PHOTO_HEIGHT = 233 * 0.75
