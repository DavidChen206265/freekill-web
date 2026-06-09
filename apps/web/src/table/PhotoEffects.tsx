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
import { animFrameUrl } from './skin.js'

// Lazy-loaded sprite frame-count manifest ("<emotion>" or "<pkg>/<emotion>" → n).
let animManifest: Record<string, number> | null = null
let animManifestPromise: Promise<Record<string, number>> | null = null
function loadAnimManifest(): Promise<Record<string, number>> {
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
  return (
    <div style={styles.layer}>
      <TrembleDriver effect={effect} boxRef={boxRef} />
      {effect?.kind === 'emotion' && effect.emotion && <EmotionSprite key={`e${effect.nonce}`} emotion={effect.emotion} />}
      {effect?.kind === 'invokeSkill' && <SkillBanner key={`s${effect.nonce}`} name={effect.skillName ?? ''} skillType={effect.skillType ?? 'special'} />}
    </div>
  )
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
// scale (PixmapAnimation.qml). Resolves frame count from anim.json; if unknown or 0,
// renders nothing (no invented art).
function EmotionSprite({ emotion }: { emotion: string }) {
  const [frames, setFrames] = useState<number | null>(null)
  const [pkg, setPkg] = useState<string | undefined>(undefined)
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    let alive = true
    loadAnimManifest().then((m) => {
      if (!alive) return
      // Built-in first, then known art packages (mirrors setEmotion's search).
      const builtin = m[emotion] ?? 0
      if (builtin > 0) { setFrames(builtin); setPkg(undefined); return }
      for (const p of ['standard_cards', 'maneuvering', 'standard']) {
        const n = m[`${p}/${emotion}`] ?? 0
        if (n > 0) { setFrames(n); setPkg(p); return }
      }
      setFrames(0)
    })
    return () => { alive = false }
  }, [emotion])

  useEffect(() => {
    if (!frames || frames <= 0) return
    setFrame(0)
    let i = 0
    const t = setInterval(() => {
      i += 1
      if (i >= frames) { clearInterval(t); setFrame(-1); return } // -1 = done, hide
      setFrame(i)
    }, 50)
    return () => clearInterval(t)
  }, [frames])

  if (!frames || frames <= 0 || frame < 0) return null
  return (
    <div style={styles.center}>
      <img src={animFrameUrl(emotion, frame, pkg)} alt="" draggable={false}
        style={{ transform: 'scale(0.75)', maxWidth: '160%', pointerEvents: 'none' }}
        onError={(e) => { (e.currentTarget.style.visibility = 'hidden') }} />
    </div>
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
      { duration: 1640, easing: 'ease-out' },
    )
    return () => anim.cancel()
  }, [])
  const size = Math.max(14, 22 - Math.max(0, name.length - 2) * 2) // scaled down for the photo box
  return (
    <div ref={ref} style={styles.center}>
      <div style={{ ...styles.banner, color: SKILL_TYPE_COLOR[skillType] ?? '#E4D5A0', fontSize: size }}>{name}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  layer: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9, overflow: 'visible' },
  center: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', overflow: 'visible' },
  banner: { fontWeight: 900, whiteSpace: 'nowrap', textShadow: '0 0 3px #000, 0 1px 2px #000, 0 0 6px #a50330', letterSpacing: 1 },
}
