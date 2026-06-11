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
// Packages that carry audio. Defaults to the built-in three; the server manifest
// (W0-2 SetServerSettings → serverManifestStore) replaces this with the real
// enabled-pack set at login via setAudioPacks(), so extension-pack audio is found
// instead of silently dropping (P7-032). Stays at defaults under old servers.
let ART_PKGS: string[] = ['standard', 'standard_cards', 'maneuvering']
/** Replace the audio-pack candidate set from the server manifest's enabledPacks. */
export function setAudioPacks(packs: string[]): void {
  if (Array.isArray(packs) && packs.length > 0) ART_PKGS = [...packs]
}

let unlocked = false
let volume = 0.7

// Manifest of every audio path that exists under /fk (built at sync time, see
// sync-fk-assets.mjs → audio.json). Entries are relative to /fk, e.g.
// "audio/skill/yingzi1.mp3". We resolve the one real candidate from this set and
// issue a single GET, instead of probing every candidate URL over the network and
// eating a 404 per miss — those 404s (HEAD or <audio>) flood the browser console on
// the server deploy (each is logged as a failed request). null until loaded; while
// loading we fall back to playing the first candidate optimistically.
let audioManifest: Set<string> | null = null
let audioManifestPromise: Promise<Set<string>> | null = null
export function loadAudioManifest(): Promise<Set<string>> {
  if (audioManifest) return Promise.resolve(audioManifest)
  if (!audioManifestPromise) {
    audioManifestPromise = fetch(`${FK}/audio.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: string[]) => { audioManifest = new Set(arr); return audioManifest })
      .catch(() => { audioManifest = new Set(); return audioManifest })
  }
  return audioManifestPromise
}

/** Call once on a user gesture (login/first click) so later plays aren't blocked. */
export function unlockAudio(): void {
  if (unlocked) return
  unlocked = true
  void loadAudioManifest() // warm the manifest so the first play resolves instantly
  // A muted no-op play primes the autoplay permission in most browsers.
  try {
    const a = new Audio()
    a.muted = true
    a.play().catch(() => { /* ignore */ })
  } catch { /* ignore */ }
  // If a BGM start was requested before any gesture (e.g. auto-login → StartGame
  // before the user clicked), kick it now that we're unlocked.
  if (bgmWanted) playBgm()
}

// Unlock on the FIRST user gesture anywhere — covers auto-login (no login click)
// and any flow that reaches the table without going through LoginPage's submit.
// Browsers only let audio play after a gesture; this guarantees we catch one.
if (typeof window !== 'undefined') {
  const onFirstGesture = () => { unlockAudio() }
  window.addEventListener('pointerdown', onFirstGesture, { once: true })
  window.addEventListener('keydown', onFirstGesture, { once: true })
}

export function setVolume(v: number): void { volume = Math.max(0, Math.min(1, v)) }

// ---- BGM (W1-1 2e) --------------------------------------------------------
// Loop the game background music (FreeKill Room.qml MediaPlayer + Config.bgmFile,
// audio/system/bgm.mp3). Mirrors QML: infinite loop, restart on stop. Browsers
// block autoplay until a gesture, so playBgm() only actually starts after
// unlockAudio() (login click) has run; we (re)try on start. Separate volume from
// SFX, with a mute toggle persisted to localStorage.
let bgmEl: HTMLAudioElement | null = null
let bgmWanted = false // a playBgm() was requested; retried on unlock if it was blocked
let bgmMuted = (() => { try { return localStorage.getItem('fk-bgm-muted') === '1' } catch { return false } })()
let bgmVolume = (() => {
  // NB: getItem returns null when unset; Number(null) === 0, which would pass a
  // `>=0 && <=1` check and silently set volume to 0 (BGM "plays" but inaudible).
  // Guard the unset/empty case explicitly → default 0.4.
  try {
    const raw = localStorage.getItem('fk-bgm-volume')
    if (raw === null || raw === '') return 0.4
    const v = Number(raw)
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.4
  } catch { return 0.4 }
})()

export function isBgmMuted(): boolean { return bgmMuted }

export function playBgm(): void {
  bgmWanted = true
  if (bgmMuted) return
  if (!bgmEl) {
    bgmEl = new Audio(`${FK}/audio/system/bgm.mp3`)
    bgmEl.loop = true
    bgmEl.volume = bgmVolume
  }
  // play() may reject when StartGame fires with no RECENT user gesture (autoplay
  // policy resets between gestures). If so, retry on the very next gesture — and
  // keep doing so until it actually starts. (A bare unlockAudio early-returns once
  // unlocked, so BGM needs its own gesture-retry rather than piggybacking on it.)
  bgmEl.play().then(() => { bgmRetryArmed = false }).catch(() => armBgmGestureRetry())
}

let bgmRetryArmed = false
function armBgmGestureRetry(): void {
  if (bgmRetryArmed) return
  bgmRetryArmed = true
  const retry = () => {
    bgmRetryArmed = false
    if (bgmWanted && !bgmMuted) playBgm()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', retry, { once: true })
    window.addEventListener('keydown', retry, { once: true })
  }
}

export function stopBgm(): void {
  bgmWanted = false
  if (bgmEl) { bgmEl.pause(); bgmEl.currentTime = 0 }
}

export function toggleBgmMuted(): boolean {
  bgmMuted = !bgmMuted
  try { localStorage.setItem('fk-bgm-muted', bgmMuted ? '1' : '0') } catch { /* ignore */ }
  if (bgmMuted) stopBgm()
  else playBgm()
  return bgmMuted
}

// ---- Card move SFX (W1-1 2f) ----------------------------------------------
// FreeKill has no generic draw/move card SFX (only出牌 voice / recast / chain via
// PlaySound). These are USER-ADDED sounds (not from原版): drawCard / moveCard, synced
// to /fk/audio/system/. Played on MoveCards by movement kind. Gated by the SFX mute
// (uses the same `unlocked` gate as other sounds; volume = SFX volume).
let sfxMuted = (() => { try { return localStorage.getItem('fk-sfx-muted') === '1' } catch { return false } })()
export function isSfxMuted(): boolean { return sfxMuted }
export function toggleSfxMuted(): boolean {
  sfxMuted = !sfxMuted
  try { localStorage.setItem('fk-sfx-muted', sfxMuted ? '1' : '0') } catch { /* ignore */ }
  return sfxMuted
}

/** Draw-card sound (cards moving into a hand from the draw pile). User-added (2f). */
export function playDrawSound(): void {
  if (sfxMuted) return
  playUrl(`${FK}/audio/system/drawCard.mp3`)
}
/** Generic card-move / discard sound. User-added (2f). */
export function playMoveSound(): void {
  if (sfxMuted) return
  playUrl(`${FK}/audio/system/moveCard.mp3`)
}



// Resolve the first candidate that EXISTS (per the manifest) and play it with a
// single GET — no network probing, so no 404s in the console. Candidates are full
// URLs ("/fk/audio/...") given in priority order. Once the manifest is loaded the
// lookup is a pure Set membership test; before then we optimistically play the first
// candidate (rare: only sounds fired in the first moments before audio.json lands).
function playUrl(url: string): void {
  const a = new Audio(url)
  a.volume = volume
  a.play().catch(() => { /* autoplay still blocked — ignore */ })
}
function playCandidates(urls: string[]): void {
  if (urls.length === 0) return
  void loadAudioManifest().then((manifest) => {
    if (manifest.size === 0) { playUrl(urls[0]!); return } // manifest unavailable → best-effort
    const url = urls.find((u) => manifest.has(u.startsWith(FK + '/') ? u.slice(FK.length + 1) : u))
    if (!url) {
      // No candidate exists — silent by design (like QML), logged for fk_log=debug.
      log.debug('lifecycle', `audio: no candidate exists for: ${urls[0] ?? ''}`)
      return
    }
    playUrl(url)
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
