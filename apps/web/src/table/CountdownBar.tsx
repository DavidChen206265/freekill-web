// CountdownBar.tsx — the operation countdown above the OK/Cancel bar (Room.qml
// `progress` ProgressBar, lines 382-428): 60% width, 12px, orange→red gradient
// fill that shrinks from the remaining fraction to 0 over the request window.
// On expiry it leaves the active state by calling the VM's FinishRequestUI (UI
// cleanup only — the server owns the real timeout and picks the default answer).

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
  return (
    <div style={styles.track}>
      <div style={{ ...styles.fill, width: `${frac * 100}%` }} />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  // 60% width, 12px tall, black track w/ rounded corners (Room.qml background).
  track: { width: '60%', height: 12, background: '#000', borderRadius: 6, overflow: 'hidden', margin: '0 auto 4px' },
  // gradient orange→red→red→orange (Room.qml contentItem gradient).
  fill: { height: '100%', borderRadius: 6, background: 'linear-gradient(90deg, orange 0%, red 30%, red 70%, orange 100%)', transition: 'width 80ms linear' },
}
