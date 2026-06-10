// audio.ts — sound playback for the table (M4 slice V). Mirrors SkinBank.getAudio /
// getAudioByPath + Backend.playSound, but with the native HTMLAudioElement (no extra
// dependency / no lockfile change vs Howler — the needs are simple one-shot plays).
// Sounds are lazily fetched at play time (never bundled). Browsers block autoplay
// until a user gesture, so we unlock on the first interaction (see unlockAudio()).
//
// Path model (SkinBank.qml getAudio:231): audio lives at
//   built-in:  /fk/audio/<type>/<name>.mp3   (system sounds: normal_damage, losehp…)
//   package:   /fk/packages/<ext>/audio/<type>/<name>.mp3   (skill/death voices)
// getAudio tries "<name>.mp3" then "<name>1.mp3". We try candidate URLs in order and
// play the first that loads; a 404 just means "no sound" (graceful, like QML).

import { log } from '../diag/log.js'

const FK = '/fk'
const ART_PKGS = ['standard', 'standard_cards', 'maneuvering']

let unlocked = false
let volume = 0.7

/** Call once on a user gesture (login/first click) so later plays aren't blocked. */
export function unlockAudio(): void {
  if (unlocked) return
  unlocked = true
  // A muted no-op play primes the autoplay permission in most browsers.
  try {
    const a = new Audio()
    a.muted = true
    a.play().catch(() => { /* ignore */ })
  } catch { /* ignore */ }
}

export function setVolume(v: number): void { volume = Math.max(0, Math.min(1, v)) }

// Probe candidate URLs in PARALLEL and play the highest-priority one that exists.
// The old approach chained <audio> elements via onerror, advancing one candidate per
// failed load. That is fine on a local dev server (a 404 is sub-millisecond) but slow
// behind a CDN: a skill voice has ~12 candidates (built-in + 3 art packages × name/
// name1 × general/deputy/plain) and the real file is usually last, so 11 sequential
// 404 round-trips delayed or cut off the voice ("播放不完全/延迟"). It also had a
// double-advance bug — a failed load fires BOTH `onerror` and the `play()` rejection,
// each calling tryNext(), so the index could skip past the one valid candidate and
// play nothing. Parallel HEAD probes collapse the wait to ~1 round-trip and pick the
// winner deterministically by priority; the chosen URL is then played via a single
// Audio element (a GET the service worker can cache for instant replays).
function playCandidates(urls: string[]): void {
  if (urls.length === 0) return
  const probes = urls.map(async (u) => {
    try { const r = await fetch(u, { method: 'HEAD' }); return r.ok ? u : null }
    catch { return null }
  })
  void Promise.all(probes).then((results) => {
    const url = results.find((u): u is string => !!u)
    if (!url) {
      // No candidate exists (404 everywhere) — silent by design (like QML), but logged
      // so "no sound on the server" is diagnosable via fk_log=debug instead of invisible.
      log.debug('lifecycle', `audio: no candidate played (assets missing/404?): ${urls[0] ?? ''}`)
      return
    }
    const a = new Audio(url)
    a.volume = volume
    a.play().catch(() => { /* autoplay still blocked — ignore */ })
  })
}

/** System sound by name (LogEvent Damage/LoseHP/ChangeMaxHp): /fk/audio/system/<name>. */
export function playSystem(name: string): void {
  if (!name) return
  playCandidates([`${FK}/audio/system/${name}.mp3`, `${FK}/audio/system/${name}1.mp3`])
}

/** Arbitrary path (LogEvent PlaySound, getAudioByPath): name may be "./audio/..". */
export function playByPath(name: string): void {
  if (!name) return
  const rel = name.replace(/^\.?\//, '') // strip leading ./ or /
  playCandidates([`${FK}/${rel}.mp3`, `${FK}/${rel}.mp3`.replace('.mp3', '1.mp3')])
}

// Skill/death voice (getAudio with extension search). We don't know the owning
// package's extension here, so try built-in then each art package, "<name>.mp3" and
// "<name>1.mp3" (SkinBank tryPaths). `audiotype` = "skill" | "death".
function audioCandidates(name: string, audiotype: string, ext?: string): string[] {
  const urls: string[] = []
  const add = (base: string) => { urls.push(`${base}/audio/${audiotype}/${name}.mp3`, `${base}/audio/${audiotype}/${name}1.mp3`) }
  add(`${FK}`) // built-in
  if (ext) add(`${FK}/packages/${ext}`)
  for (const p of ART_PKGS) if (p !== ext) add(`${FK}/packages/${p}`)
  return urls
}

/** Skill voice (LogEvent PlaySkillSound): tries <skill>_<general> then <skill>.
 *  RoomLogic.js:1396-1425 tries main general, then deputy, then plain skill. */
export function playSkillSound(skill: string, general?: string, deputy?: string, ext?: string): void {
  if (!skill) return
  const urls: string[] = []
  if (general) urls.push(...audioCandidates(`${skill}_${general}`, 'skill', ext))
  if (deputy) urls.push(...audioCandidates(`${skill}_${deputy}`, 'skill', ext))
  urls.push(...audioCandidates(skill, 'skill', ext))
  playCandidates(urls)
}

/** Death voice (LogEvent Death): /fk/[packages/<ext>/]audio/death/<general>. */
export function playDeath(general: string, ext?: string): void {
  if (!general) return
  playCandidates(audioCandidates(general, 'death', ext))
}
