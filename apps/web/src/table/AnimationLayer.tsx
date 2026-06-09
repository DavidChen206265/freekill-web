// AnimationLayer.tsx — scene-level visual effects on the fixed stage (M4 slice V):
// Indicate target lines (V-1), InvokeUltSkill / SuperLightBox full-screen (later).
// Mirrors RoomLogic.js's roomScene-level animations (doIndicate 568-594, the bigAnim
// loader). Like CardLayer this is an absolute overlay using LOGICAL stage coords; we
// compute photo centres from seatLayout (no DOM measurement needed — the stage is a
// fixed 1200×540 canvas). Each effect removes itself from the store when its WAAPI
// animation finishes.

import { useEffect, useRef } from 'react'
import { useAnimationStore, type SceneEffect } from '../stores/animationStore.js'
import { useGameStore } from '../stores/gameStore.js'
import { seatPosition, PHOTO_WIDTH, PHOTO_HEIGHT } from './seatLayout.js'
import { STAGE_W, STAGE_H } from './Stage.js'

// Logical-coord centre of a player's photo (id → {x,y}). Uses the same seatPosition
// the Photo component uses, so the line endpoints land on the rendered photos.
function playerCenter(pid: number): { x: number; y: number } | null {
  const st = useGameStore.getState()
  const p = st.players[pid]
  if (!p) return null
  const playerNum = (st.seatOrder.length > 0 ? st.seatOrder.length : Object.keys(st.players).length) || 1
  const pos = seatPosition(p.index, playerNum)
  return { x: pos.x + (PHOTO_WIDTH * pos.scale) / 2, y: pos.y + (PHOTO_HEIGHT * pos.scale) / 2 }
}

export function AnimationLayer() {
  const scene = useAnimationStore((s) => s.scene)
  return (
    <div style={styles.layer}>
      {scene.map((e) => {
        if (e.kind === 'indicate') return <IndicateLines key={e.id} effect={e} />
        if (e.kind === 'ultSkill') return <UltSkillBanner key={e.id} effect={e} />
        // superLightBox: built-in default not yet rendered (package-specific = M5);
        // it self-removes immediately so it never lingers.
        return <SelfRemove key={e.id} id={e.id} />
      })}
    </div>
  )
}

// Indicate (IndicatorLine.qml): from → each target chain. Per QML the line grows
// (200ms OutCubic), holds (200ms), then fades (300ms InQuart) = 700ms total, colour
// #96943D, ~6px. We draw each segment as an SVG line over the stage and run the
// 3-phase opacity/length via WAAPI, removing the whole effect when done.
function IndicateLines({ effect }: { effect: SceneEffect }) {
  const remove = useAnimationStore((s) => s.removeScene)
  const ref = useRef<SVGSVGElement | null>(null)

  // Build all segments (from → each node in each chain; chains can be multi-hop).
  const from = effect.from
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = []
  if (from !== undefined) {
    const fromC = playerCenter(from)
    for (const chain of effect.chains ?? []) {
      let prev = fromC
      let prevId = from
      for (const toId of chain) {
        const toC = playerCenter(toId)
        if (prev && toC && toId !== prevId) segments.push({ x1: prev.x, y1: prev.y, x2: toC.x, y2: toC.y })
        prev = toC
        prevId = toId
      }
    }
  }

  useEffect(() => {
    const el = ref.current
    if (!el || segments.length === 0) { remove(effect.id); return }
    // 3-phase: grow+hold via stroke-dashoffset isn't trivial across segments, so we
    // approximate QML's perceived effect with opacity in/hold/out over 700ms (the
    // line itself is drawn instantly; the in/out fade reads as the indicate flash).
    const anim = el.animate(
      [
        { opacity: 0 },
        { opacity: 1, offset: 200 / 700 },
        { opacity: 1, offset: 400 / 700 },
        { opacity: 0 },
      ],
      { duration: 700, easing: 'linear' },
    )
    anim.onfinish = () => remove(effect.id)
    anim.oncancel = () => remove(effect.id)
    return () => anim.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect.id])

  return (
    <svg ref={ref} style={styles.svg} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} width={STAGE_W} height={STAGE_H}>
      {segments.map((s, i) => (
        <g key={i}>
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#96943D" strokeWidth={6} strokeLinecap="round" opacity={0.85} />
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.3} />
          <circle cx={s.x2} cy={s.y2} r={7} fill="#96943D" />
        </g>
      ))}
    </svg>
  )
}

// InvokeUltSkill (UltSkillAnimation.qml): full-screen limited-skill banner. Minimal
// faithful version — big centred skill name that fades in/holds/out (~2s, matching
// the server's delay(2000)). General art omitted (scaffold; refine later).
function UltSkillBanner({ effect }: { effect: SceneEffect }) {
  const remove = useAnimationStore((s) => s.removeScene)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) { remove(effect.id); return }
    const anim = el.animate(
      [{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'scale(1)', offset: 0.15 }, { opacity: 1, transform: 'scale(1)', offset: 0.8 }, { opacity: 0, transform: 'scale(1.1)' }],
      { duration: 2000, easing: 'ease-out' },
    )
    anim.onfinish = () => remove(effect.id)
    anim.oncancel = () => remove(effect.id)
    return () => anim.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect.id])
  return (
    <div ref={ref} style={styles.ult}>
      <div style={styles.ultText}>{effect.skillName}</div>
    </div>
  )
}

function SelfRemove({ id }: { id: number }) {
  const remove = useAnimationStore((s) => s.removeScene)
  useEffect(() => { remove(id) }, [id, remove])
  return null
}

const styles: Record<string, React.CSSProperties> = {
  layer: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 60 },
  svg: { position: 'absolute', left: 0, top: 0, width: STAGE_W, height: STAGE_H, overflow: 'visible' },
  ult: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' },
  ultText: { fontSize: 56, fontWeight: 900, color: '#E4D5A0', textShadow: '0 0 8px #000, 0 0 16px #a50330, 0 2px 4px #000', letterSpacing: 4 },
}
