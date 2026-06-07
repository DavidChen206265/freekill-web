// useLongPress.ts — a long-press gesture for opening detail panels in a browser,
// mirroring QML's TapHandler.onLongPressed (BasicItem.qml: long-press fires the
// same `rightClicked` as a desktop right-click). Fires `onLongPress` after the
// hold delay if the pointer hasn't moved past a small slop, so it doesn't fight
// the left-click/tap that does target selection. Returns pointer handlers to spread.

import { useRef } from 'react'

const HOLD_MS = 500   // touch long-press threshold
const MOVE_SLOP = 10  // px of movement that cancels the press (treat as drag/scroll)

export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  // True briefly after a long-press fires, so the trailing click can be ignored.
  const fired = useRef(false)

  const clear = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    start.current = null
  }

  return {
    /** Whether the most recent gesture was a long-press (consume to skip the click). */
    consumeFired: () => { const f = fired.current; fired.current = false; return f },
    onPointerDown: (e: React.PointerEvent) => {
      clear() // reset any prior pending timer
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = setTimeout(() => { timer.current = null; fired.current = true; onLongPress() }, HOLD_MS)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current) return
      if (Math.abs(e.clientX - start.current.x) > MOVE_SLOP || Math.abs(e.clientY - start.current.y) > MOVE_SLOP) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
  }
}
