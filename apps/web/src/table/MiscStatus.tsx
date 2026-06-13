// MiscStatus.tsx — top-right table status (MiscStatus.qml): current round number,
// an elapsed game timer (local 1s tick), and the draw-pile count over a card-back.
// Data from miscStore (UpdateRoundNum / UpdateDrawPile + a local clock). Anchored
// top-right to mirror Room.qml:623-628 (right:108, top:8). Hidden until a round or
// pile count exists (MiscStatus.qml:9 visible: roundNum || pileNum).

import { useEffect, useState } from 'react'
import { useMiscStore } from '../stores/miscStore.js'
import { cardBackPic } from './skin.js'

const PILE_NUM_FONT_SIZE = Math.round(28 * 2 / 3)

function fmtTime(totalSec: number): string {
  const s = totalSec % 60
  const m = Math.floor((totalSec - s) / 60) % 60
  const h = Math.floor(totalSec / 3600)
  const ss = s < 10 ? `0${s}` : `${s}`
  return h ? `${h}:${m < 10 ? '0' : ''}${m}:${ss}` : `${m}:${ss}`
}

export function MiscStatus() {
  const pileNum = useMiscStore((s) => s.pileNum)
  const roundNum = useMiscStore((s) => s.roundNum)
  const startedAt = useMiscStore((s) => s.startedAt)
  const [elapsed, setElapsed] = useState(0)

  // Local 1s tick while the clock is running (MiscStatus.qml Timer interval 1000).
  useEffect(() => {
    if (!startedAt) { setElapsed(0); return }
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  if (!roundNum && !pileNum) return null
  const back = cardBackPic()
  return (
    <div style={styles.wrap}>
      <div style={styles.topRow}>
        {startedAt > 0 && <span style={styles.text}>{fmtTime(elapsed)}</span>}
        <span style={styles.text}>第 {roundNum} 轮</span>
      </div>
      <div style={styles.deck}>
        {back && <img src={back} alt="" style={styles.deckImg} draggable={false} />}
        <span style={styles.pileNum}>{pileNum}</span>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  // Room.qml:625-628 anchors.right + top, rightMargin 108, topMargin 8.
  wrap: { position: 'absolute', right: 108, top: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', zIndex: 8, pointerEvents: 'none' },
  topRow: { display: 'flex', gap: 12, alignItems: 'baseline' },
  text: { color: '#F0E5DA', fontSize: 18, fontWeight: 700, textShadow: '0 0 2px #3D2D1C, 0 1px 1px #3D2D1C' },
  deck: { position: 'relative', width: 32, height: 42, marginTop: 8, marginRight: 12, display: 'grid', placeItems: 'center' },
  deckImg: { position: 'absolute', inset: 0, width: 32, height: 42, objectFit: 'cover', borderRadius: 3 },
  pileNum: { position: 'relative', color: '#fff', fontSize: PILE_NUM_FONT_SIZE, fontWeight: 900, textShadow: '0 0 3px #000, 0 0 3px #000' },
}
