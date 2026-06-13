// PhotoFocusBar.tsx — per-player thinking countdown + "<command> thinking..." tip
// (Photo.qml progressBar lines 359-398 + the control/tip text). Shown only while
// this player is in the MoveFocus set (focusStore). The bar (full width, 4px, at
// the photo's bottom edge) shrinks from the remaining fraction to 0 over the
// think window; on expiry it just hides (UI only — the server owns the timeout).

import { useEffect, useState } from 'react'
import { useFocusStore } from '../stores/focusStore.js'
import { fractionLeft } from '../stores/timerStore.js'
import { tr } from '../i18n/zh.js'

export function PhotoFocusBar({ playerId }: { playerId: number }) {
  const ids = useFocusStore((s) => s.ids)
  const command = useFocusStore((s) => s.command)
  const durationMs = useFocusStore((s) => s.durationMs)
  const deadline = useFocusStore((s) => s.deadline)
  const focused = ids.includes(playerId)
  const [frac, setFrac] = useState(1)

  useEffect(() => {
    if (!focused || durationMs <= 0) return
    let raf = 0
    const tick = () => {
      const f = fractionLeft(durationMs, deadline, Date.now())
      setFrac(f)
      if (f <= 0) return // expired: stop animating; bar renders empty/hidden
      raf = requestAnimationFrame(tick)
    }
    setFrac(fractionLeft(durationMs, deadline, Date.now()))
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [focused, durationMs, deadline])

  if (!focused) return null
  // QML tip: Lua.tr(command) + Lua.tr(" thinking...") — both via the i18n cache.
  const tip = command ? `${tr(command)}${tr(' thinking...')}` : ''
  return (
    <>
      <div style={styles.track}>
        <div style={{ ...styles.fill, width: `${frac * 100}%` }} />
      </div>
      {tip && <div style={styles.tip}>{tip}</div>}
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  // full width, 4px, flush to the photo's bottom edge (anchors.bottomMargin:-4).
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: 'rgba(0,0,0,.5)', zIndex: 7 },
  fill: { height: '100%', background: 'linear-gradient(90deg, orange, red)', transition: 'width 80ms linear' },
  // "<cmd> thinking..." tip just under the bar.
  tip: { position: 'absolute', left: 17, bottom: -16, fontSize: 12, color: '#fff', whiteSpace: 'nowrap', textShadow: '0 0 2px #000, 0 0 2px #000', zIndex: 7 },
}
