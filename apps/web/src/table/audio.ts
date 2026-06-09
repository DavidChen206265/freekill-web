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

// Try each candidate URL until one plays. We probe with a transient Audio element;
// onerror advances to the next candidate. Returns immediately (fire-and-forget).
function playCandidates(urls: string[]): void {
  if (urls.length === 0) return
  let i = 0
  const tryNext = () => {
    if (i >= urls.length) return
    const url = urls[i++]!
    const a = new Audio(url)
    a.volume = volume
    a.onerror = () => { tryNext() }
    a.play().catch(() => { /* autoplay blocked or decode fail → try next */ tryNext() })
  }
  tryNext()
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
