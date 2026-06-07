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
import { useInteractionStore } from '../stores/interactionStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { resolveAreaBox, CARD_W, CARD_H } from './areas.js'
import { CardFaceView } from './CardFaceView.js'

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
  const cardStates = useInteractionStore((s) => s.cards)
  const interact = useVmStore((s) => s.interact)

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
    // Equip/judge/special cards belong INSIDE the Photo (small icon strips), not
    // as full floating cards on the stage — they're rendered there in slice 6.
    // CardLayer only floats the moving/table/hand/draw cards.
    if (key.startsWith('equip:') || key.startsWith('judge:') || key.startsWith('special:')) continue
    const box = resolveAreaBox(key, playerIndex, playerNum)
    if (!box) continue
    const n = ids.length
    // ItemArea-style: lay out left→right, shrink spacing if overflow.
    const span = Math.max(0, box.w - CARD_W)
    const step = n > 1 ? Math.min(CARD_W + 6, span / (n - 1)) : 0
    ids.forEach((cid, i) => {
      const sel = cardStates[cid]?.selected
      targets.set(cid, {
        x: box.x + step * i,
        // Selected hand cards rise 20px (ItemArea.updateCardPosition origY-=20).
        y: box.y - (sel ? 20 : 0),
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
    // Re-run when cards move OR when selection changes (selected cards rise).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveSeq, cardStates])

  // Render union of all cards currently in some area.
  const allCards: { cid: number; t: Target }[] = []
  for (const [cid, t] of targets) allCards.push({ cid, t })

  const onCardClick = (cid: number) => {
    const st = cardStates[cid]
    if (!st?.enabled && !st?.selected) return // not interactable
    void interact('CardItem', cid, 'click', { selected: !st?.selected })
  }

  return (
    <div style={styles.layer}>
      {allCards.map(({ cid, t }) => {
        const st = cardStates[cid]
        const interactable = !!st && (st.enabled || st.selected)
        return (
          <div
            key={cid}
            ref={(el) => { if (el) nodeRefs.current.set(cid, el); else nodeRefs.current.delete(cid) }}
            onClick={() => onCardClick(cid)}
            style={{
              ...styles.card,
              transform: `translate(${t.x}px, ${t.y}px)`,
              pointerEvents: interactable ? 'auto' : 'none',
              cursor: interactable ? 'pointer' : 'default',
              outline: st?.selected ? '3px solid #f1c40f' : 'none',
              filter: st && !st.enabled && !st.selected ? 'brightness(0.5)' : 'none',
            }}
          >
            <CardFaceView cid={cid} faceUp={t.faceUp} width={CARD_W} height={CARD_H} />
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  layer: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 },
  card: {
    position: 'absolute', left: 0, top: 0, width: CARD_W, height: CARD_H,
    borderRadius: 6, willChange: 'transform',
  },
}
