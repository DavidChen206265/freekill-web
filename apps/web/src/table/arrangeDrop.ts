// arrangeDrop.ts — pure reducer for the ArrangeBox drag (Guanxing/Exchange/
// ArrangeCards). Extracted so the move/reorder/over-capacity-bump logic is unit
// testable without the DOM. State = { slots: ordered cids per area, tray: unplaced }.

export interface ArrangeState { slots: number[][]; tray: number[] }

// Move `cid` into area `ai` at insertion index `idx` (ai<0 = back to the tray).
// Removes it from wherever it currently is first; if the target area overflows its
// capacity, the oldest non-just-placed card is bumped back to the tray (mirrors the
// QML box which never lets an area exceed areaCapacities).
export function arrangeDrop(prev: ArrangeState, capacities: number[], cid: number, ai: number, idx: number): ArrangeState {
  const slots = prev.slots.map((a) => a.filter((c) => c !== cid))
  let tray = prev.tray.filter((c) => c !== cid)
  if (ai < 0) {
    tray = [...tray, cid]
  } else if (ai < slots.length) {
    const arr = slots[ai]!
    arr.splice(Math.max(0, Math.min(idx, arr.length)), 0, cid)
    const cap = capacities[ai] ?? arr.length
    while (arr.length > cap) {
      const bumped = arr.find((c) => c !== cid)
      if (bumped === undefined) break
      arr.splice(arr.indexOf(bumped), 1)
      tray = [...tray, bumped]
    }
  }
  return { slots, tray }
}

// Every card placed and every area within [limit, capacity].
export function arrangeValid(st: ArrangeState, capacities: number[], limits: number[]): boolean {
  if (st.tray.length !== 0) return false
  return st.slots.every((a, i) => a.length >= (limits[i] ?? 0) && a.length <= (capacities[i] ?? a.length))
}
