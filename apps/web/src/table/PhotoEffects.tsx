// PhotoEffects.tsx — per-player transient effects on a Photo (M4 slice V):
//   • tremble  (LogEvent Damage → Photo.qml tremble: ±15px shake, 200ms)
//   • emotion  (Animate Emotion → PixmapAnimation sprite: 50ms/frame, scale 0.75)
//   • invokeSkill banner (Animate InvokeSkill → SkillInvokeAnimation: name slides
//     in 240ms, holds, fades, ~1640ms total)
// Driven by animationStore.players[pid] (latest effect + nonce). The nonce makes a
// repeated effect (e.g. two "slash" in a row) replay. Frame counts for emotion
// sprites come from /fk/anim.json (built at sync time; the browser can't ls a dir).

import { useEffect, useRef, useState, type RefObject } from 'react'
import { useAnimationStore, type PlayerEffect } from '../stores/animationStore.js'
import { resolveAnim, animFrameUrl } from './skin.js'

// Lazy-loaded sprite frame-count manifest ("<emotion>" or "<pkg>/<name>" → n).
let animManifest: Record<string, number> | null = null
let animManifestPromise: Promise<Record<string, number>> | null = null
export function loadAnimManifest(): Promise<Record<string, number>> {
  if (animManifest) return Promise.resolve(animManifest)
  if (!animManifestPromise) {
    animManifestPromise = fetch('/fk/anim.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((m: Record<string, number>) => { animManifest = m; return m })
      .catch(() => { animManifest = {}; return {} })
  }
  return animManifestPromise
}

export function PhotoEffects({ playerId, boxRef }: { playerId: number; boxRef: RefObject<HTMLDivElement | null> }) {
  const effect = useAnimationStore((s) => s.players[playerId])
  const targetNonce = useAnimationStore((s) => s.targeted[playerId])
  return (
    <div style={styles.layer}>
      <TrembleDriver effect={effect} boxRef={boxRef} />
      {targetNonce !== undefined && <TargetPulse key={`t${targetNonce}`} />}
      {effect?.kind === 'emotion' && effect.emotion && <EmotionSprite key={`e${effect.nonce}`} emotion={effect.emotion} />}
      {effect?.kind === 'invokeSkill' && <SkillBanner key={`s${effect.nonce}`} name={effect.skillName ?? ''} skillType={effect.skillType ?? 'special'} />}
    </div>
  )
}

// Targeted-by-a-card pulse: a red ring that flashes over the photo when this player
// is an Indicate target, so the "who → whom" relationship is clear even without the
// war log (and even if the brief indicate line is missed). ~900ms, then fades.
function TargetPulse() {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const anim = el.animate(
      [
        { opacity: 0, boxShadow: '0 0 0 0 rgba(231,76,60,0)' },
        { opacity: 1, boxShadow: '0 0 12px 4px rgba(231,76,60,0.95)', offset: 0.2 },
        { opacity: 1, boxShadow: '0 0 12px 4px rgba(231,76,60,0.9)', offset: 0.75 },
        { opacity: 0, boxShadow: '0 0 18px 6px rgba(231,76,60,0)' },
      ],
      { duration: 900, easing: 'ease-out', fill: 'forwards' },
    )
    return () => anim.cancel()
  }, [])
  return <div ref={ref} style={styles.targetRing} />
}

// Tremble: shake the photo box left then back (Photo.qml:337-353 → x-15 100ms InQuad
// → x 100ms OutQuad). Applied to the box ref via WAAPI so it composes over layout.
function TrembleDriver({ effect, boxRef }: { effect: PlayerEffect | undefined; boxRef: RefObject<HTMLDivElement | null> }) {
  const lastNonce = useRef(0)
  useEffect(() => {
    if (!effect || effect.kind !== 'tremble' || effect.nonce === lastNonce.current) return
    lastNonce.current = effect.nonce
    const el = boxRef.current
    if (!el) return
    const anim = el.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-15px)', offset: 0.5, easing: 'ease-in' }, { transform: 'translateX(0)', easing: 'ease-out' }],
      { duration: 200 },
    )
    return () => anim.cancel()
  }, [effect, boxRef])
  return null
}

// Emotion sprite: cycle numbered PNG frames at 50ms each, one-shot, centred, 0.75
// scale (PixmapAnimation.qml interval 50, loop false, scale 0.75). The emotion is
// either a bare built-in name ("damage") or a path-form ("./packages/.../anim/slash")
// — resolveAnim() handles both. Frame count from anim.json; unknown/0 → nothing
// (never invented art). Exported so CardLayer can play setCardEmotion on a table card.
const FRAME_MS = 50 // PixmapAnimation.qml interval

export function EmotionSprite({ emotion, scale = 0.75 }: { emotion: string; scale?: number }) {
  const [frames, setFrames] = useState<number | null>(null)
  const [frame, setFrame] = useState(0)
  const { key, base } = resolveAnim(emotion)

  useEffect(() => {
    let alive = true
    loadAnimManifest().then((m) => { if (alive) setFrames(m[key] ?? 0) })
    return () => { alive = false }
  }, [key])

  // Preload ALL frame PNGs, THEN play. Behind a CDN each frame's first GET costs a
  // full round-trip (~100ms > the 50ms frame interval), so the old "advance a lazy
  // <img src> on a 50ms setInterval" stalled and dropped frames ("卡顿/部分帧不播").
  // We pre-fetch every frame into the browser cache up front, then drive the index by
  // requestAnimationFrame on WALL-CLOCK elapsed time (not timer ticks, which drift /
  // pile up under load). Once cached the rendered <img> swaps instantly. A short
  // timeout bounds the wait so a missing frame never hangs the whole effect.
  useEffect(() => {
    if (!frames || frames <= 0) return
    let raf = 0
    let timer = 0
    let cancelled = false
    let loaded = 0
    const imgs: HTMLImageElement[] = []
    const start = () => {
      if (cancelled) return
      const t0 = performance.now()
      const tick = () => {
        if (cancelled) return
        const i = Math.floor((performance.now() - t0) / FRAME_MS)
        if (i >= frames) { setFrame(-1); return } // done, hide
        setFrame(i)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    const onOne = () => { if (++loaded >= frames && !cancelled) { clearTimeout(timer); start() } }
    for (let i = 0; i < frames; i++) {
      const im = new Image()
      im.onload = onOne
      im.onerror = onOne // count errors too so one missing frame can't stall the play
      im.src = animFrameUrl(base, i)
      imgs.push(im)
    }
    // Fallback: don't wait forever for preloads — start anyway after 600ms.
    timer = window.setTimeout(() => { if (!cancelled) start() }, 600)
    setFrame(0)
    return () => { cancelled = true; cancelAnimationFrame(raf); clearTimeout(timer); imgs.forEach((im) => { im.onload = im.onerror = null }) }
  }, [frames, base])

  if (!frames || frames <= 0 || frame < 0) return null
  return (
    <img src={animFrameUrl(base, frame)} alt="" draggable={false}
      style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
        pointerEvents: 'none', maxWidth: 'none',
      }}
      onError={(e) => { (e.currentTarget.style.visibility = 'hidden') }} />
  )
}

// Skill banner: the activated skill's name slides in from the right + fades out
// (SkillInvokeAnimation.qml: opacity 0→1 200ms, slide 240ms, hold to 1440ms, fade
// 200ms; font size max(24, 48-(len-2)*6)). skillType tints the banner.
const SKILL_TYPE_COLOR: Record<string, string> = {
  special: '#E4D5A0', big: '#ff6b6b', switch: '#7ec8e3', active: '#9fe6a0', notactive: '#cccccc',
}
function SkillBanner({ name, skillType }: { name: string; skillType: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const anim = el.animate(
      [
        { opacity: 0, transform: 'translateX(60px)' },
        { opacity: 1, transform: 'translateX(0)', offset: 240 / 1640 },
        { opacity: 1, transform: 'translateX(0)', offset: 1440 / 1640 },
        { opacity: 0, transform: 'translateX(0)' },
      ],
      // fill:forwards so the banner STAYS faded out after the run (without fill it
      // reverts to the element's base opacity:1 and lingers — the reported bug).
      { duration: 1640, easing: 'ease-out', fill: 'forwards' },
    )
    return () => anim.cancel()
  }, [])
  const size = Math.max(14, 22 - Math.max(0, name.length - 2) * 2) // scaled down for the photo box
  return (
    <div ref={ref} style={styles.center}>
      {/* skillInvoke/<skill_type> sprite behind the name (SkillInvokeAnimation.qml
          :12-18 PixmapAnimation, scale 0.75). One-shot; absent sprite → just text. */}
      <div style={styles.skillSprite}><EmotionSprite emotion={`skillInvoke/${skillType}`} scale={0.6} /></div>
      <div style={{ ...styles.banner, color: SKILL_TYPE_COLOR[skillType] ?? '#E4D5A0', fontSize: size }}>{name}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  layer: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9, overflow: 'visible' },
  targetRing: { position: 'absolute', inset: 0, borderRadius: 8, border: '2px solid rgba(231,76,60,0.95)', boxSizing: 'border-box', opacity: 0 },
  center: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', overflow: 'visible' },
  banner: { fontWeight: 900, whiteSpace: 'nowrap', textShadow: '0 0 3px #000, 0 1px 2px #000, 0 0 6px #a50330', letterSpacing: 1 },
  skillSprite: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: 0.9 },
}
