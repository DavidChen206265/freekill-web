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
// the Photo component uses, so the line endpoints land on the rendered photos. For
// SELF, QML's getPhotoOrDashboard returns the DASHBOARD (Room.qml:725-727), not the
// seat photo — so indicate lines from/to self originate at the dashboard centre
// (bottom band, full width, height 150 → centre at STAGE_W/2, STAGE_H-75).
function playerCenter(pid: number): { x: number; y: number } | null {
  const st = useGameStore.getState()
  const p = st.players[pid]
  if (!p) return null
  if (pid === st.selfId) return { x: STAGE_W / 2, y: STAGE_H - 75 }
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
    // 3-phase fade: in (180ms) → hold → out. QML's IndicatorLine is ~700ms; we hold
    // a bit longer (total 1100ms) so cross-table targeting is easy to follow without
    // the war log — the line + arrowhead are the primary "who → whom" cue.
    const DUR = 1100
    const anim = el.animate(
      [
        { opacity: 0 },
        { opacity: 1, offset: 180 / DUR },
        { opacity: 1, offset: 850 / DUR },
        { opacity: 0 },
      ],
      { duration: DUR, easing: 'linear' },
    )
    anim.onfinish = () => remove(effect.id)
    // NOTE: do NOT remove on cancel. Under React 18 StrictMode (dev) effects run
    // mount→cleanup→mount; if cancel removed the scene effect, the cleanup of the
    // throwaway first mount would unmount the element before it ever animated (the
    // reported "看不见" bug). Cancel only stops the discarded first-mount animation.
    return () => anim.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect.id])

  return (
    <svg ref={ref} style={styles.svg} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} width={STAGE_W} height={STAGE_H}>
      {segments.map((s, i) => {
        // Arrowhead at the target end so the direction (who → whom) is unmistakable
        // even at a glance — this is the cue that lets players read targeting without
        // the war log. Triangle pointing along the line toward (x2,y2).
        const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1)
        const ah = 16 // arrowhead length
        const aw = 9 // half-width
        const tipX = s.x2, tipY = s.y2
        const baseX = s.x2 - ah * Math.cos(ang), baseY = s.y2 - ah * Math.sin(ang)
        const leftX = baseX - aw * Math.sin(ang), leftY = baseY + aw * Math.cos(ang)
        const rightX = baseX + aw * Math.sin(ang), rightY = baseY - aw * Math.cos(ang)
        return (
          <g key={i}>
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#96943D" strokeWidth={6} strokeLinecap="round" opacity={0.9} />
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.35} />
            {/* source dot */}
            <circle cx={s.x1} cy={s.y1} r={5} fill="#96943D" />
            {/* target arrowhead */}
            <polygon points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`} fill="#d8d24a" stroke="#000" strokeWidth={0.5} />
          </g>
        )
      })}
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
    // NOTE: do NOT remove on cancel. Under React 18 StrictMode (dev) effects run
    // mount→cleanup→mount; if cancel removed the scene effect, the cleanup of the
    // throwaway first mount would unmount the element before it ever animated (the
    // reported "看不见" bug). Cancel only stops the discarded first-mount animation.
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
