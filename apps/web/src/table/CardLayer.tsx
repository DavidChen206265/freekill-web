// CardLayer.tsx — the floating card layer (R-ANIM). All cards live here as
// absolutely-positioned nodes on the stage (NOT inside area components), so moves
// are command-driven WAAPI flights rather than React re-mounts (which would
// teleport). Mirrors RoomLogic's dynamicCardArea + goBack (500ms, OutQuad).
//
// Resting position = area box + slot within the area (ItemArea-style spacing).
// On each moveSeq bump we diff each card's prev vs next resting rect and animate.

import { useEffect, useRef } from 'react'
import { useCardStore, type AreaKey } from '../stores/cardStore.js'
import { useGameStore } from '../stores/gameStore.js'
import { resolveAreaBox, CARD_W, CARD_H } from './areas.js'

const GO_BACK_MS = 500
const EASE_OUT_QUAD = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'

interface Target { x: number; y: number; faceUp: boolean }

export function CardLayer() {
  const areas = useCardStore((s) => s.areas)
  const known = useCardStore((s) => s.known)
  const moveSeq = useCardStore((s) => s.moveSeq)
  const players = useGameStore((s) => s.players)
  const seatOrder = useGameStore((s) => s.seatOrder)
  const selfId = useGameStore((s) => s.selfId)

  const nodeRefs = useRef(new Map<number, HTMLDivElement>())
  const lastPos = useRef(new Map<number, { x: number; y: number }>())

  // Compute every card's resting target (area box + slot within area).
  const playerNum = seatOrder.length || 1
  const playerIndex = (pid: number) => {
    const p = players[pid]
    return p ? { index: p.index, isSelf: pid === selfId } : null
  }

  const targets = new Map<number, Target>()
  for (const [key, ids] of Object.entries(areas) as [AreaKey, number[]][]) {
    const box = resolveAreaBox(key, playerIndex, playerNum)
    if (!box) continue
    const n = ids.length
    // ItemArea-style: lay out left→right, shrink spacing if overflow.
    const span = Math.max(0, box.w - CARD_W)
    const step = n > 1 ? Math.min(CARD_W + 6, span / (n - 1)) : 0
    ids.forEach((cid, i) => {
      targets.set(cid, {
        x: box.x + step * i,
        y: box.y,
        faceUp: known[cid] ?? false,
      })
    })
  }

  // Animate every card from its last position to the new target on moveSeq change.
  useEffect(() => {
    for (const [cid, t] of targets) {
      const el = nodeRefs.current.get(cid)
      if (!el) continue
      const prev = lastPos.current.get(cid)
      if (prev && (prev.x !== t.x || prev.y !== t.y)) {
        el.animate(
          [
            { transform: `translate(${prev.x}px, ${prev.y}px)` },
            { transform: `translate(${t.x}px, ${t.y}px)` },
          ],
          { duration: GO_BACK_MS, easing: EASE_OUT_QUAD, fill: 'forwards' },
        )
      }
      // commit final transform so it sticks after the animation
      el.style.transform = `translate(${t.x}px, ${t.y}px)`
      lastPos.current.set(cid, { x: t.x, y: t.y })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveSeq])

  // Render union of all cards currently in some area.
  const allCards: { cid: number; t: Target }[] = []
  for (const [cid, t] of targets) allCards.push({ cid, t })

  return (
    <div style={styles.layer}>
      {allCards.map(({ cid, t }) => (
        <div
          key={cid}
          ref={(el) => { if (el) nodeRefs.current.set(cid, el); else nodeRefs.current.delete(cid) }}
          style={{ ...styles.card, transform: `translate(${t.x}px, ${t.y}px)` }}
        >
          {t.faceUp ? <span style={styles.face}>{cid}</span> : <span style={styles.back}>FK</span>}
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  layer: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 },
  card: {
    position: 'absolute', left: 0, top: 0, width: CARD_W, height: CARD_H,
    borderRadius: 6, border: '1px solid #222', display: 'grid', placeItems: 'center',
    fontSize: 13, fontWeight: 700, willChange: 'transform',
  },
  face: { background: '#f5f0e1', color: '#222', width: '100%', height: '100%', display: 'grid', placeItems: 'center', borderRadius: 6 },
  back: { background: '#3b5b8c', color: '#dde', width: '100%', height: '100%', display: 'grid', placeItems: 'center', borderRadius: 6 },
}
