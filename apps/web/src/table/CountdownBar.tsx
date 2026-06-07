// CountdownBar.tsx — the operation countdown above the OK/Cancel row, a 1:1 port
// of Room.qml `progress` ProgressBar (lines 382-428): 60% width, 12px tall, black
// rounded track with an orange→red→red→orange gradient fill that shrinks from full
// to 0 over a fixed 30s window, plus the remaining-seconds readout (requested).
//
// Driven by the active-request EDGE: when any request UI becomes active (ui_emu
// interaction OR a popup), start a fresh 30s; when it ends, stop. This is robust
// across request boundaries (the scattered per-command start/stop was flaky). On
// expiry it calls FinishRequestUI (UI cleanup only — server owns the real timeout).

import { useEffect, useState, useRef } from 'react'
import { useTimerStore, fractionLeft } from '../stores/timerStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { useInteractionStore } from '../stores/interactionStore.js'
import { usePopupStore } from '../stores/popupStore.js'

export function CountdownBar() {
  const interactionActive = useInteractionStore((s) => s.active)
  const popupActive = usePopupStore((s) => s.active != null)
  const requestActive = interactionActive || popupActive

  const running = useTimerStore((s) => s.running)
  const totalMs = useTimerStore((s) => s.totalMs)
  const deadline = useTimerStore((s) => s.deadline)
  const start = useTimerStore((s) => s.start)
  const stop = useTimerStore((s) => s.stop)
  const vm = useVmStore((s) => s.vm)
  const [frac, setFrac] = useState(1)
  const wasActive = useRef(false)

  // Edge-driven: start a fresh countdown when a request becomes active, stop when
  // it ends. (No-op while still active — the ui_emu click loop keeps it active.)
  useEffect(() => {
    if (requestActive && !wasActive.current) start()
    else if (!requestActive && wasActive.current) stop()
    wasActive.current = requestActive
  }, [requestActive, start, stop])

  // Animate the fill while running; on expiry leave the active state (Room.qml
  // progressAnim.onFinished → notactive → FinishRequestUI). No client reply.
  useEffect(() => {
    if (!running) return
    let raf = 0
    const tick = () => {
      const f = fractionLeft(totalMs, deadline, Date.now())
      setFrac(f)
      if (f <= 0) {
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
  // Self-positioned just above the okCancel row (Room.qml: progress anchored to
  // okCancel.top + 4). 60% width, centered. The prompt text sits above it.
  wrap: { position: 'absolute', left: '50%', bottom: 82, transform: 'translateX(-50%)', width: '60%', display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none' },
  track: { flex: 1, height: 12, background: '#000', borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6, background: 'linear-gradient(90deg, orange 0%, red 30%, red 70%, orange 100%)', transition: 'width 200ms linear' },
  secs: { color: '#fff', fontSize: 13, fontWeight: 700, minWidth: 30, textAlign: 'left', textShadow: '0 0 2px #000, 0 0 2px #000' },
}
