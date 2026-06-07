// CountdownBar.tsx — the operation countdown above the OK/Cancel row, a 1:1 port
// of Room.qml `progress` ProgressBar (lines 382-428): 60% width, 12px tall, black
// rounded track with an orange→red→red→orange gradient fill that shrinks from full
// to 0 over the window, plus the remaining-seconds readout (requested).
//
// Driven purely by timerStore.running (= roomScene.state "active"/"notactive"),
// which vmStore sets via activate()/deactivate() exactly where RoomLogic.js calls
// roomScene.activate() / state="notactive". On expiry it runs the →notactive
// cleanup (FinishRequestUI) — UI only; the server owns the real timeout.

import { useEffect, useState } from 'react'
import { useTimerStore, fractionLeft } from '../stores/timerStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { useInteractionStore } from '../stores/interactionStore.js'
import { usePopupStore } from '../stores/popupStore.js'

export function CountdownBar() {
  const running = useTimerStore((s) => s.running)
  const totalMs = useTimerStore((s) => s.totalMs)
  const deadline = useTimerStore((s) => s.deadline)
  const deactivate = useTimerStore((s) => s.deactivate)
  const vm = useVmStore((s) => s.vm)
  const [frac, setFrac] = useState(1)

  // Animate the fill while running; on expiry leave the active state (Room.qml
  // progressAnim.onFinished → state="notactive" → FinishRequestUI). No client reply.
  useEffect(() => {
    if (!running) return
    let raf = 0
    const tick = () => {
      const f = fractionLeft(totalMs, deadline, Date.now())
      setFrac(f)
      if (f <= 0) {
        deactivate()
        useInteractionStore.getState().clear()
        usePopupStore.getState().clear()
        vm?.finishRequestUI()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    setFrac(fractionLeft(totalMs, deadline, Date.now()))
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, totalMs, deadline, deactivate, vm])

  if (!running) return null
  const secsLeft = Math.ceil((totalMs * frac) / 1000)
  return (
    <div style={styles.wrap}>
      <div style={styles.track}>
        <div style={{ ...styles.fill, width: `${frac * 100}%` }} />
      </div>
      <span style={styles.secs}>{secsLeft}s</span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  // Sits just above the OK/Cancel row (Room.qml: progress anchored okCancel.top+4).
  // Narrower than the QML 60% because our fixed stage scales up on wide windows,
  // where 60% spans most of the screen and crowds the buttons/cards.
  wrap: { position: 'absolute', left: '50%', bottom: 84, transform: 'translateX(-50%)', width: 420, display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' },
  track: { flex: 1, height: 10, background: '#000', borderRadius: 5, overflow: 'hidden' },
  // NO CSS transition: the rAF loop sets width every frame, so a transition just
  // lags behind and makes the shrink look frozen. Frame-by-frame is already smooth.
  fill: { height: '100%', borderRadius: 5, background: 'linear-gradient(90deg, orange 0%, red 30%, red 70%, orange 100%)' },
  secs: { color: '#fff', fontSize: 13, fontWeight: 700, minWidth: 30, textAlign: 'left', textShadow: '0 0 2px #000, 0 0 2px #000' },
}
