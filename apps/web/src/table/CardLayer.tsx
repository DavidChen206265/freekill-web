// CardLayer.tsx — the floating card layer (R-ANIM). All cards live here as
// absolutely-positioned nodes on the stage (NOT inside area components), so moves
// are command-driven WAAPI flights rather than React re-mounts (which would
// teleport). Mirrors RoomLogic's dynamicCardArea + goBack (500ms, OutQuad).
//
// Resting position = area box + slot within the area (ItemArea-style spacing).
// On each moveSeq bump we diff each card's prev vs next resting rect and animate.

import { useEffect, useRef, useState } from 'react'
import { useCardStore, type AreaKey } from '../stores/cardStore.js'
import { useGameStore } from '../stores/gameStore.js'
import { useInteractionStore } from '../stores/interactionStore.js'
import { useCardNoteStore } from '../stores/cardNoteStore.js'
import { useAnimationStore } from '../stores/animationStore.js'
import { EmotionSprite } from './PhotoEffects.js'
import { useVmStore } from '../stores/vmStore.js'
import { resolveAreaBox, CARD_W, CARD_H, TABLE_PILE } from './areas.js'
import { STAGE_W } from './Stage.js'
import { seatPosition, PHOTO_WIDTH, PHOTO_HEIGHT } from './seatLayout.js'
import { CardFaceView } from './CardFaceView.js'
import { chosenPic } from './skin.js'
import { tr } from '../i18n/zh.js'
import { computeHandDropIndex, dragMoved } from './cardDrag.js'
import { isTrustState } from './roomActions.js'

const GO_BACK_MS = 500
const EASE_OUT_QUAD = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'

interface Target { x: number; y: number; faceUp: boolean }

export function CardLayer() {
  const areas = useCardStore((s) => s.areas)
  const known = useCardStore((s) => s.known)
  const moveSeq = useCardStore((s) => s.moveSeq)
  const lastMoved = useCardStore((s) => s.lastMoved)
  const players = useGameStore((s) => s.players)
  const seatOrder = useGameStore((s) => s.seatOrder)
  const selfId = useGameStore((s) => s.selfId)
  const selfTrusting = useGameStore((s) => s.selfId !== undefined ? isTrustState(s.players[s.selfId]?.state) : false)
  const cardStates = useInteractionStore((s) => s.cards)
  const photoStates = useInteractionStore((s) => s.photos)
  const buttons = useInteractionStore((s) => s.buttons)
  const requestActive = useInteractionStore((s) => s.active)
  const expandCards = useInteractionStore((s) => s.expandCards)
  const cardNotes = useCardNoteStore((s) => s.notes)
  const cardEmotions = useAnimationStore((s) => s.cards)
  const interact = useVmStore((s) => s.interact)

  const nodeRefs = useRef(new Map<number, HTMLDivElement>())
  const lastPos = useRef(new Map<number, { x: number; y: number }>())
  // One-shot "settle" flights for cards entering equip/judge slots: those areas are
  // drawn as static icons inside the Photo (not floating cards), so the card has no
  // resting node to fly to. We render a transient flying card (table → slot box) that
  // fades out on arrival, then the Photo icon shows the persistent state — mirroring
  // QML where the equip CardArea animates the card into the slot. Keyed by a seq id.
  const [flights, setFlights] = useState<{ id: number; cid: number; from: { x: number; y: number }; to: { x: number; y: number }; faceUp: boolean }[]>([])
  const flightSeq = useRef(0)
  const layerRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<{ cid: number; x: number; y: number; dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  useEffect(() => {
    if (selfTrusting) setDrag(null)
  }, [selfTrusting])

  // Compute every card's resting target (area box + slot within area).
  const playerNum = seatOrder.length || 1
  const playerIndex = (pid: number) => {
    const p = players[pid]
    return p ? { index: p.index, isSelf: pid === selfId } : null
  }

  const targets = new Map<number, Target>()
  // Self's hand cids — during an active request, a hand card the VM did NOT include in
  // UpdateRequestUI (no cardStates entry) is unusable and must show the disable mask.
  // The VM only emits the cards it touched (e.g. PlayCard sends only the usable slash,
  // not the unusable jink), unlike QML which seeds every hand card as a scene item that
  // defaults to disabled. So "no state during an active request" = disabled here.
  const selfHandCids = new Set<number>()
  // Expand-pile cards (遗计 etc., active_skill.lua expandPile): not in any area, but
  // QML injects them into the hand area with a footnote. Append them to self's hand.
  const expandIds = Object.keys(expandCards).map(Number)
  for (const [key, ids] of Object.entries(areas) as [AreaKey, number[]][]) {
    // Equip/judge/special cards belong INSIDE the Photo (small icon strips), not
    // as full floating cards on the stage — they're rendered there in slice 6.
    // CardLayer only floats the moving/table/hand/draw cards.
    if (key.startsWith('equip:') || key.startsWith('judge:') || key.startsWith('special:')) continue
    // Other players' hands are NEVER rendered as cards in QML (only a count badge
    // on the Photo + a HandcardViewer text list). Only render SELF's hand here.
    if (key.startsWith('hand:') && Number(key.slice(5)) !== selfId) continue
    const box = resolveAreaBox(key, playerIndex, playerNum)
    if (!box) continue
    // Append expand-pile cards after self's real hand cards (QML hand-area inject).
    const isSelfHand = key.startsWith('hand:') && Number(key.slice(5)) === selfId
    if (isSelfHand) for (const c of ids) selfHandCids.add(c)
    const layoutIds = isSelfHand && expandIds.length > 0 ? [...ids, ...expandIds.filter((c) => !ids.includes(c))] : ids
    const n = layoutIds.length
    // ItemArea-style: lay out left→right, shrink spacing if overflow.
    const span = Math.max(0, box.w - CARD_W)
    const step = n > 1 ? Math.min(CARD_W + 6, span / (n - 1)) : 0
    // tablePile/drawPile cards are CENTERED in their box (TablePile.qml CardArea
    // anchors.horizontalCenter; drawPile stacks at a point). Hand/area cards anchor
    // left. Compute the row's start x so the run is centred for the table/draw piles.
    const centered = key === 'tablePile' || key === 'drawPile'
    const rowW = n > 0 ? CARD_W + step * (n - 1) : 0
    const startX = centered ? box.x + (box.w - rowW) / 2 : box.x
    layoutIds.forEach((cid, i) => {
      const sel = cardStates[cid]?.selected
      targets.set(cid, {
        x: startX + step * i,
        // Selected hand cards rise 20px (ItemArea.updateCardPosition origY-=20).
        y: box.y - (sel ? 20 : 0),
        faceUp: known[cid] ?? (expandCards[cid] ? true : false),
      })
    })
  }
  // If self has no hand area yet but there ARE expand cards, still render them in a
  // fallback hand box so the request is completable.
  if (expandIds.length > 0 && !expandIds.some((c) => targets.has(c))) {
    const box = resolveAreaBox(`hand:${selfId}` as AreaKey, playerIndex, playerNum)
    if (box) {
      const n = expandIds.length
      const span = Math.max(0, box.w - CARD_W)
      const step = n > 1 ? Math.min(CARD_W + 6, span / (n - 1)) : 0
      expandIds.forEach((cid, i) => {
        const sel = cardStates[cid]?.selected
        targets.set(cid, { x: box.x + step * i, y: box.y - (sel ? 20 : 0), faceUp: true })
      })
    }
  }

  // Vanish pass (TablePile.qml vanishTimer, 1500ms): remove table cards marked
  // vanishable by a Destroy* command. We DON'T remove on Destroy* (that kills the
  // fly-in for instant cards); instead they linger ~1.5s then vanish here.
  useEffect(() => {
    const t = setInterval(() => useCardStore.getState().vanishTableCards(), 1500)
    return () => clearInterval(t)
  }, [])

  // Animate every card from its last position to the new target on moveSeq change.
  useEffect(() => {
    // Source area per cid for this move batch — lets a card that wasn't rendered
    // before (came from an opponent's hand / the draw pile) FLY from its owner's
    // area to the table, instead of popping in at the centre (QML moveCards animates
    // every card along its from→to path). We seed `prev` from the source area box.
    const fromArea = new Map<number, string>()
    for (const m of lastMoved) fromArea.set(m.cid, m.from)
    for (const [cid, t] of targets) {
      const el = nodeRefs.current.get(cid)
      if (!el) continue
      let prev = lastPos.current.get(cid)
      if (!prev) {
        // No rendered prior position: seed from the move's source area so it flies in
        // (e.g. a played card entering tablePile flies from the user's hand/photo).
        const src = fromArea.get(cid)
        const box = src && src !== 'tablePile' ? resolveAreaBox(src as AreaKey, playerIndex, playerNum) : null
        if (box) prev = { x: box.x, y: box.y }
      }
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
    // Equip/judge are static icons in the Photo (CardLayer skips those areas), so a
    // card landing there has no node to fly to. Spawn a one-shot flight (its last
    // floating position → the slot box) that fades out on arrival (QML animates the
    // card into the equip/judge CardArea). Use the prior table/hand pos as the start.
    // Also covers an OPPONENT's hand (hand:<other>): QML's handcardArea is an
    // InvisibleCardArea centred on the photo — cards fly to the photo centre then
    // vanish into the count (gains/draws), so we fly + fade there too.
    const settle: typeof flights = []
    for (const m of lastMoved) {
      const toOther = m.to.startsWith('hand:') && Number(m.to.slice(5)) !== selfId
      if (!(m.to.startsWith('equip:') || m.to.startsWith('judge:') || toOther)) continue
      // Start from the card's last floating position if it had one (it flew to the
      // table first); else from its source area box (opponent's hand was never
      // rendered) so it still flies into the slot rather than popping in.
      let from: { x: number; y: number } | undefined = lastPos.current.get(m.cid)
      if (!from) {
        const srcBox = m.from && m.from !== 'tablePile' ? resolveAreaBox(m.from as AreaKey, playerIndex, playerNum) : TABLE_PILE
        from = srcBox ? { x: srcBox.x, y: srcBox.y } : undefined
      }
      const box = resolveAreaBox(m.to, playerIndex, playerNum)
      if (!from || !box) continue
      // Opponent hand cards are hidden (face-down); equip/judge are face-up per known.
      const faceUp = toOther ? false : (known[m.cid] ?? true)
      settle.push({ id: ++flightSeq.current, cid: m.cid, from, to: { x: box.x, y: box.y }, faceUp })
      lastPos.current.delete(m.cid) // it's left the floating layer
    }
    if (settle.length > 0) setFlights((f) => [...f, ...settle])
    // Consumed the move-origin buffer (flights + prev seeding) — clear so the next
    // batch starts fresh and settled cards aren't re-flown.
    useCardStore.getState().clearLastMoved()
    // Re-run when cards move OR when selection changes (selected cards rise).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveSeq, cardStates])

  // Render union of all cards currently in some area.
  const allCards: { cid: number; t: Target }[] = []
  for (const [cid, t] of targets) allCards.push({ cid, t })

  const onCardClick = (cid: number) => {
    if (selfTrusting) return
    if (suppressClick.current) { suppressClick.current = false; return }
    const st = cardStates[cid]
    if (!st?.enabled && !st?.selected) return // not interactable
    void interact('CardItem', cid, 'click', { selected: !st?.selected, autoTarget: false })
  }

  const onCardDoubleClick = (cid: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (selfTrusting) return
    const st = cardStates[cid]
    if (!st?.enabled && !st?.selected) return
    void interact('CardItem', cid, 'doubleClick', { selected: !!st.selected, doubleClickUse: true, autoTarget: false })
  }

  const stagePoint = (clientX: number, clientY: number) => {
    const rect = layerRef.current?.getBoundingClientRect()
    if (!rect) return null
    const scale = rect.width / STAGE_W || 1
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }
  const findPhotoAt = (x: number, y: number): number | null => {
    for (const id of seatOrder) {
      const p = players[id]
      if (!p) continue
      const pos = seatPosition(p.index, playerNum)
      const w = PHOTO_WIDTH * pos.scale
      const h = PHOTO_HEIGHT * pos.scale
      if (x >= pos.x && x <= pos.x + w && y >= pos.y && y <= pos.y + h) return id
    }
    return null
  }
  const onPointerDown = (cid: number, t: Target, e: React.PointerEvent<HTMLDivElement>) => {
    if (selfTrusting) return
    if (!selfHandCids.has(cid)) return
    const pt = stagePoint(e.clientX, e.clientY)
    if (!pt) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ cid, x: t.x, y: t.y, dx: pt.x - t.x, dy: pt.y - t.y, startX: pt.x, startY: pt.y, moved: false })
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (selfTrusting) return
    if (!drag) return
    const pt = stagePoint(e.clientX, e.clientY)
    if (!pt) return
    const moved = drag.moved || dragMoved(drag.startX, drag.startY, pt.x, pt.y)
    setDrag({ ...drag, x: pt.x - drag.dx, y: pt.y - drag.dy, moved })
  }
  const onPointerUp = (cid: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || drag.cid !== cid) return
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    const pt = stagePoint(e.clientX, e.clientY)
    const finalDrag = pt
      ? { ...drag, x: pt.x - drag.dx, y: pt.y - drag.dy, moved: drag.moved || dragMoved(drag.startX, drag.startY, pt.x, pt.y) }
      : drag
    setDrag(null)
    if (!finalDrag.moved) return
    suppressClick.current = true
    const center = { x: finalDrag.x + CARD_W / 2, y: finalDrag.y + CARD_H / 2 }
    const st = cardStates[cid]
    const pid = findPhotoAt(center.x, center.y)
    const pst = pid !== null ? photoStates[pid] : undefined
    const hitPhoto = pid !== null && !!pst && (pst.enabled || pst.selected)
    const hitOk = !!buttons.OK?.enabled && center.y < TABLE_PILE.y + TABLE_PILE.h
    if (st && st.enabled && !st.selected && (hitPhoto || hitOk)) void interact('CardItem', cid, 'click', { selected: true, autoTarget: false })
    if (pid !== null && pst && (pst.enabled || pst.selected)) {
      void interact('Photo', pid, 'click', { selected: !pst.selected, autoTarget: false })
    }
    const handKey = `hand:${selfId}` as AreaKey
    const handIds = areas[handKey] ?? []
    if (selfId !== undefined && handIds.includes(cid) && (useVmStore.getState().vm?.canSortHandcards(selfId) ?? true)) {
      const nextIdx = computeHandDropIndex(handIds, cid, center.x, (other) => {
        const ot = targets.get(other)
        return ot ? ot.x + CARD_W / 2 : undefined
      })
      useCardStore.getState().reorderArea(handKey, cid, nextIdx)
    }
    if (hitOk) {
      void interact('Button', 'OK', 'click', {})
    }
  }

  return (
    <div ref={layerRef} style={styles.layer}>
      {allCards.map(({ cid, t }) => {
        const st = cardStates[cid]
        const interactable = !!st && (st.enabled || st.selected)
        const isDragged = drag?.cid === cid
        const interactive = !selfTrusting && (interactable || selfHandCids.has(cid))
        return (
          <div
            key={cid}
            ref={(el) => { if (el) nodeRefs.current.set(cid, el); else nodeRefs.current.delete(cid) }}
            onClick={() => onCardClick(cid)}
            onDoubleClick={(e) => onCardDoubleClick(cid, e)}
            onPointerDown={(e) => onPointerDown(cid, t, e)}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => onPointerUp(cid, e)}
            onPointerCancel={() => { if (drag?.cid === cid) setDrag(null) }}
            style={{
              ...styles.card,
              transform: `translate(${isDragged ? drag.x : t.x}px, ${isDragged ? drag.y : t.y}px)`,
              opacity: isDragged ? 0.8 : 1,
              zIndex: isDragged ? 80 : undefined,
              pointerEvents: interactive ? 'auto' : 'none',
              cursor: isDragged ? 'grabbing' : selfHandCids.has(cid) ? 'grab' : interactable ? 'pointer' : 'default',
              touchAction: selfHandCids.has(cid) ? 'none' : undefined,
            }}
          >
            <CardFaceView cid={cid} faceUp={t.faceUp} width={CARD_W} height={CARD_H} />
            {/* is_card emotion (setCardEmotion, e.g. judgebad/judgegood on a judge
                card): play the sprite ON this table card (RoomLogic.js setEmotion
                isCardId branch). Keyed by nonce so a repeat replays. */}
            {cardEmotions[cid] && <EmotionSprite key={`c${cardEmotions[cid]!.nonce}`} emotion={cardEmotions[cid]!.emotion!} scale={0.6} />}
            {/* table-card virtual name (SetCardVirtName): snow box over the face. */}
            {cardNotes[cid]?.virtName && <span style={styles.virtName}>{tr(cardNotes[cid]!.virtName!)}</span>}
            {/* footnote: SetCardFootnote (table cards, already localized) wins; else
                expand-pile footnote (active_skill expandPile, e.g. 遗计's drawn cards) */}
            {cardNotes[cid]?.footnote
              ? <span style={styles.footnote}>{cardNotes[cid]!.footnote}</span>
              : expandCards[cid]?.footnote && <span style={styles.footnote}>{tr(expandCards[cid]!.footnote!)}</span>}
            {/* selected: chosen.png centered low (BasicCard chosen, y:90 scale 1.25). */}
            {st?.selected && <img src={chosenPic()} alt="" style={styles.chosen} draggable={false} />}
            {/* unselectable: a translucent black overlay (BasicCard disable rect, not
                a brightness filter — matches the QML rgba(0,0,0,.5) @ opacity .7).
                `enabled` here is the VM's per-request selectability: QML binds
                CardItem/Photo.selectable = uiUpdate.enabled (Room.qml:746,
                dashboard.applyChange), so driving the overlay off `enabled` matches the
                original's selectable-driven overlay — same VM signal, protocol name.
                A self-hand card with NO state during an active request is unusable: the
                VM omits untouched cards from UpdateRequestUI (e.g. PlayCard sends only
                the usable slash, not the jink), whereas QML seeds every hand card as a
                disabled scene item — so treat "no state + active + self-hand" as masked. */}
            {(st ? (!st.enabled && !st.selected) : (requestActive && selfHandCids.has(cid))) && <div style={styles.disable} />}
          </div>
        )
      })}
      {/* one-shot equip/judge "settle" flights (table → slot box, fade out on arrival) */}
      {flights.map((fl) => (
        <FlightCard key={fl.id} fl={fl} onDone={() => setFlights((f) => f.filter((x) => x.id !== fl.id))} />
      ))}
    </div>
  )
}

// A transient card that flies from `from` to `to` then fades out (equip/judge settle).
function FlightCard({ fl, onDone }: { fl: { cid: number; from: { x: number; y: number }; to: { x: number; y: number }; faceUp: boolean }; onDone: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) { onDone(); return }
    const anim = el.animate(
      [
        { transform: `translate(${fl.from.x}px, ${fl.from.y}px)`, opacity: 1 },
        { transform: `translate(${fl.to.x}px, ${fl.to.y}px)`, opacity: 1, offset: 0.75 },
        { transform: `translate(${fl.to.x}px, ${fl.to.y}px)`, opacity: 0 },
      ],
      { duration: GO_BACK_MS + 200, easing: EASE_OUT_QUAD, fill: 'forwards' },
    )
    anim.onfinish = onDone
    // Do NOT call onDone on cancel: React 18 StrictMode (dev) runs effects
    // mount→cleanup→mount, and cleanup cancels this anim — if cancel removed the
    // flight, the settle card would unmount before it flew (equip "no animation" bug).
    return () => anim.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div ref={ref} style={{ ...styles.card, pointerEvents: 'none' }}>
      <CardFaceView cid={fl.cid} faceUp={fl.faceUp} width={CARD_W} height={CARD_H} />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  layer: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 },
  card: {
    position: 'absolute', left: 0, top: 0, width: CARD_W, height: CARD_H,
    borderRadius: 6, willChange: 'transform',
  },
  // BasicCard chosen.png: centered horizontally, low on the card, scaled up 1.25.
  chosen: { position: 'absolute', left: '50%', top: `${(90 / 130) * 100}%`, transform: 'translateX(-50%) scale(1.25)', zIndex: 1, pointerEvents: 'none' },
  // BasicCard disable rect: translucent black over the whole card (z:2).
  disable: { position: 'absolute', inset: 0, borderRadius: 6, background: 'rgba(0,0,0,0.5)', opacity: 0.7, zIndex: 2, pointerEvents: 'none' },
  // expand-pile footnote (CardItem.footnote): a label strip at the card bottom.
  footnote: { position: 'absolute', left: 0, right: 0, bottom: 0, fontSize: 10, fontWeight: 700, color: '#E4D5A0', textAlign: 'center', background: 'rgba(0,0,0,.55)', borderRadius: '0 0 6px 6px', zIndex: 3, pointerEvents: 'none' },
  // SetCardVirtName: transformed name shown in a snow box over the mid card (mirrors
  // CardItem.qml virt_rect — a light label band).
  virtName: { position: 'absolute', left: 0, right: 0, top: '42%', fontSize: 11, fontWeight: 700, color: '#222', textAlign: 'center', background: 'rgba(255,250,250,.85)', border: '1px solid #000', borderRadius: 3, zIndex: 4, pointerEvents: 'none' },
}
