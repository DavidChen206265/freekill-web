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
  // Self-positioned just above the okCancel row (Room.qml: progress anchored to
  // okCancel.top + 4). 60% width, centered. The prompt text sits above it.
  wrap: { position: 'absolute', left: '50%', bottom: 82, transform: 'translateX(-50%)', width: '60%', display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' },
  track: { flex: 1, height: 12, background: '#000', borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6, background: 'linear-gradient(90deg, orange 0%, red 30%, red 70%, orange 100%)', transition: 'width 200ms linear' },
  secs: { color: '#fff', fontSize: 13, fontWeight: 700, minWidth: 30, textAlign: 'left', textShadow: '0 0 2px #000, 0 0 2px #000' },
}
