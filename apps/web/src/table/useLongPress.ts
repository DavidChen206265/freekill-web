// useLongPress.ts — a long-press gesture for opening detail panels in a browser,
// mirroring QML's TapHandler.onLongPressed (BasicItem.qml: long-press fires the
// same `rightClicked` as a desktop right-click). Fires `onLongPress` after the
// hold delay if the pointer hasn't moved past a small slop, so it doesn't fight
// the left-click/tap that does target selection. Returns pointer handlers to spread.

import { useRef } from 'react'

const HOLD_MS = 450   // touch long-press threshold
const MOVE_SLOP = 12  // px of movement that cancels the press (treat as drag/scroll)

export interface LongPressHandlers {
  consumeFired: () => boolean
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
}

// Plain factory holding the gesture state in refs supplied by the caller — so it
// is identical whether driven by useRef (runtime) or plain objects (tests).
export function makeLongPress(
  onLongPress: () => void,
  refs: {
    timer: { current: ReturnType<typeof setTimeout> | null }
    start: { current: { x: number; y: number } | null }
    fired: { current: boolean }
  },
): LongPressHandlers {
  const { timer, start, fired } = refs
  const clear = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    start.current = null
  }
  return {
    /** Whether the most recent gesture was a long-press (consume to skip the click). */
    consumeFired: () => { const f = fired.current; fired.current = false; return f },
    onPointerDown: (e) => {
      clear()
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = setTimeout(() => { timer.current = null; fired.current = true; onLongPress() }, HOLD_MS)
    },
    onPointerMove: (e) => {
      if (!start.current) return
      if (Math.abs(e.clientX - start.current.x) > MOVE_SLOP || Math.abs(e.clientY - start.current.y) > MOVE_SLOP) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
  }
}

export function useLongPress(onLongPress: () => void): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  return makeLongPress(onLongPress, { timer, start, fired })
}
