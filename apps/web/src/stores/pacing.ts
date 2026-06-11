// pacing.ts — client-side "performance beat" so a burst of server packets plays at
// a watchable cadence instead of collapsing. See memory game-pacing-server-vs-client.
//
// WHY: the asio server is fire-and-forget for visual commands (MoveCards/Animate/
// LogEvent); the original Qt client has NO command queue — pacing emerges from QML
// `Behavior on x/y` interpolating each position change over its duration + sparse
// server room:delay. Our web client dispatches every notifyUI command synchronously
// inside feedPacket, so on a WAN (packets arrive bunched) the animationStore (latest-
// wins) drops middle frames and resources can't keep up. We reintroduce the missing
// beat at the feedChain layer: after feeding a packet that carries a performance, we
// wait ~its animation duration before feeding the next.
//
// State-mirror commands (PropertyUpdate, request packets, reconnect/log-replay) pace
// to 0 (no wait) — only VISUAL performances introduce a beat.

// Per-command beat in ms. Values mirror the ACTUAL animation durations in the render
// components (cited) so the wait matches what the user sees — do NOT invent numbers.
//   MoveCards    : card fly-in       (CardLayer.tsx GO_BACK_MS = 500)
//   Indicate     : arrow line        (AnimationLayer.tsx ~700ms)
//   Emotion      : sprite            (PhotoEffects.tsx 50ms/frame; ~10 frames ≈ 500)
//   InvokeSkill  : skill banner      (PhotoEffects.tsx 1640ms total)
//   tremble      : Damage shake      (PhotoEffects.tsx 200ms)
// A beat is the dominant single effect's duration, not a sum — effects overlap (just
// like QML), we only need to stop the NEXT command from starting on top of this one.
const MOVE_CARDS_MS = 500
const INDICATE_MS = 700
const EMOTION_MS = 500
const INVOKE_SKILL_MS = 1640
const ULT_SKILL_MS = 1640
const TREMBLE_MS = 200
const DEATH_MS = 500

// Animate sub-type → beat. Keyed by data.type (handleAnimate switch in vmStore).
function animateBeat(data: unknown): number {
  const t = (data as { type?: string })?.type
  switch (t) {
    case 'Indicate': return INDICATE_MS
    case 'Emotion': return EMOTION_MS
    case 'InvokeSkill': return INVOKE_SKILL_MS
    case 'InvokeUltSkill': return ULT_SKILL_MS
    // SuperLightBox/LightBox render nothing or a no-op here — no beat.
    default: return 0
  }
}

// LogEvent sub-type → beat (handleLogEvent switch). Audio-only events (LoseHP/skill
// sound) don't gate the next command; visual ones (Damage tremble, Death) do.
function logEventBeat(data: unknown): number {
  const t = (data as { type?: string })?.type
  switch (t) {
    case 'Damage': return TREMBLE_MS
    case 'Death': return DEATH_MS
    default: return 0
  }
}

/** Base beat (ms, BEFORE the user pace multiplier) for a notifyUI command. 0 = no
 *  wait (state-mirror / instant / audio-only). */
export function paceFor(command: string, data: unknown): number {
  switch (command) {
    case 'MoveCards': return MOVE_CARDS_MS
    case 'Animate': return animateBeat(data)
    case 'LogEvent': return logEventBeat(data)
    default: return 0
  }
}

// ---- user-adjustable speed (localStorage fk_pace) --------------------------
const PACE_KEY = 'fk_pace'
const PACE_MIN = 0.1
const PACE_MAX = 5
const PACE_DEFAULT = 1

function clampPace(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return PACE_DEFAULT
  return Math.min(PACE_MAX, Math.max(PACE_MIN, x))
}

/** Current pace multiplier (1 = normal, <1 faster, >1 slower). */
export function getPace(): number {
  try {
    const raw = localStorage.getItem(PACE_KEY)
    if (raw == null || raw === '') return PACE_DEFAULT
    return clampPace(Number(raw))
  } catch { return PACE_DEFAULT }
}

/** Set + persist the pace multiplier. Returns the clamped value actually stored. */
export function setPace(x: number): number {
  const v = clampPace(x)
  try { localStorage.setItem(PACE_KEY, String(v)) } catch { /* ignore */ }
  return v
}

/** Resolve to the actual wait (beat * pace) for a command; 0 → resolves immediately
 *  (no microtask churn / no setTimeout(0) drift). */
export function nextBeat(command: string, data: unknown): Promise<void> {
  const base = paceFor(command, data)
  if (base <= 0) return Promise.resolve()
  const ms = base * getPace()
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}
