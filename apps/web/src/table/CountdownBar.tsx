// CountdownBar.tsx — the operation countdown above the OK/Cancel row, a 1:1 port
// of Room.qml `progress` ProgressBar (lines 382-428): 60% width, 12px tall, black
// rounded track with an orange→red→red→orange gradient fill that shrinks from the
// remaining fraction to 0 over the request window. QML shows no number; we add the
// remaining seconds beside it (requested). On expiry it leaves the active state by
// calling the VM's FinishRequestUI — UI cleanup only; the server owns the real
// timeout and picks the default answer (the client never auto-replies).

import { useEffect, useState } from 'react'
import { useTimerStore, fractionLeft } from '../stores/timerStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { useInteractionStore } from '../stores/interactionStore.js'
import { usePopupStore } from '../stores/popupStore.js'

export function CountdownBar() {
  const running = useTimerStore((s) => s.running)
  const totalMs = useTimerStore((s) => s.totalMs)
  const deadline = useTimerStore((s) => s.deadline)
  const stop = useTimerStore((s) => s.stop)
  const vm = useVmStore((s) => s.vm)
  const [frac, setFrac] = useState(1)

  useEffect(() => {
    if (!running) return
    let raf = 0
    const tick = () => {
      const f = fractionLeft(totalMs, deadline, Date.now())
      setFrac(f)
      if (f <= 0) {
        // Expired: leave the active state (Room.qml progressAnim.onFinished →
        // state=notactive → FinishRequestUI). No reply is sent from the client.
        stop()
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
  }, [running, totalMs, deadline, stop, vm])

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
  // Self-positioned (Dashboard's bar is an absolute container with absolute
  // children). QML anchors progress above okCancel, horizontalCenter, width 60%.
  wrap: { position: 'absolute', left: '50%', bottom: 92, transform: 'translateX(-50%)', width: '60%', display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' },
  // black rounded track, 12px (Room.qml background Rectangle).
  track: { flex: 1, height: 12, background: '#000', borderRadius: 6, overflow: 'hidden' },
  // gradient orange→red→red→orange (Room.qml contentItem gradient).
  fill: { height: '100%', borderRadius: 6, background: 'linear-gradient(90deg, orange 0%, red 30%, red 70%, orange 100%)', transition: 'width 100ms linear' },
  // remaining seconds (added per request; not in the QML bar).
  secs: { color: '#fff', fontSize: 13, fontWeight: 700, minWidth: 28, textAlign: 'left', textShadow: '0 0 2px #000, 0 0 2px #000' },
}
