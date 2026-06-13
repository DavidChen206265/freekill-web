// skin.ts — resolves image asset URLs the way SkinBank.qml does, but against the
// synced static tree under /fk (see sync-fk-assets.mjs). Two roots:
//   ① built-in chrome   /fk/image/photo/...        (magatama / role / back / death)
//   ② per-package art    /fk/packages/<ext>/image/  (generals .jpg / card .png / icons)
// The package name (`extension`) for a general/card comes from the VM
// (GetGeneralData(name).extension / GetCardData(cid).extension). When unknown we
// fall back to scanning the bundled packages. Missing assets return '' so the
// caller can render a placeholder (we never invent art).

const FK = '/fk'
const PHOTO = `${FK}/image/photo`
// Packages that actually carry general/card art. Defaults to the built-in three;
// the server manifest (W0-2 SetServerSettings → serverManifestStore) replaces this
// with the real enabled-pack set at login via setArtPacks(), so extension-pack art
// (utility/sp/standard_ex/…) is found instead of silently falling back (P7-032).
// Stays at the defaults under old servers that send no manifest.
let ART_PKGS: string[] = ['standard', 'standard_cards', 'maneuvering']
/** Replace the art-pack candidate set from the server manifest's enabledPacks. */
export function setArtPacks(packs: string[]): void {
  if (Array.isArray(packs) && packs.length > 0) ART_PKGS = [...packs]
}

// Manifest of per-package card-art paths that exist under /fk (built at sync time,
// see sync-fk-assets.mjs → images.json). Used to prune candidate lists so the client
// only requests the package that actually has a card/equip PNG — otherwise each
// <img> miss across packages logs a 404 in the browser console (same class as the
// audio 404 storm). null until loaded; while loading, candidate lists are returned
// unfiltered and the <img> onError fallback still resolves them.
let imageManifest: Set<string> | null = null
let imageManifestPromise: Promise<Set<string>> | null = null
export function loadImageManifest(): Promise<Set<string>> {
  if (imageManifest) return Promise.resolve(imageManifest)
  if (imageManifestPromise) return imageManifestPromise
  imageManifestPromise = fetch(`${FK}/images.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((arr: string[]) => { imageManifest = new Set(arr); return imageManifest! })
    .catch(() => { imageManifest = new Set(); return imageManifest! })
  return imageManifestPromise
}
// Kick off the load at module init so candidate lists are pruned by first render.
void loadImageManifest()
export function isImageManifestLoaded(): boolean {
  return imageManifest !== null
}
// Keep only candidates that exist per the manifest. Before the manifest loads (or if
// it's empty/unavailable) return the list unchanged so the <img> onError chain still
// works — only the console-noise reduction is deferred, never correctness.
function pruneToExisting(urls: string[], fallbackWhenEmpty = true): string[] {
  const m = imageManifest
  if (!m || m.size === 0) return urls
  const filtered = urls.filter((u) => !u.startsWith(`${FK}/packages/`) || m.has(u.slice(FK.length + 1)))
  return filtered.length > 0 || !fallbackWhenEmpty ? filtered : urls
}

function pkgPath(ext: string | undefined, sub: string, name: string, suffix: string): string {
  // Prefer the known extension; else leave '' (caller may try resolveByScan).
  if (ext) return `${FK}/packages/${ext}/image/${sub}/${name}${suffix}`
  return ''
}

/** General portrait: packages/<ext>/image/generals/<name>.jpg */
export function generalPic(name: string, ext?: string): string {
  return name ? pkgPath(ext, 'generals', name, '.jpg') : ''
}

/** General avatar (small): packages/<ext>/image/generals/avatar/<name>.jpg */
export function generalAvatar(name: string, ext?: string): string {
  return name ? pkgPath(ext, 'generals/avatar', name, '.jpg') : ''
}

/** Candidate general-portrait URLs, mirroring cardPicCandidates: the general's own
 *  extension first, then every enabled art package (ART_PKGS, set from the server
 *  manifest at login). The caller walks these on <img> error so a general whose art
 *  ships only in an extension pack (e.g. re__xusheng → sp) still resolves even when the
 *  VM reported a wrong/stale extension (a stale client returned 'standard'). Pruned to
 *  paths that exist per images.json so a correct client makes ONE GET, not a 404 probe
 *  per package. De-duplicated; empty when no name. */
export function generalPicCandidates(name: string, ext?: string): string[] {
  if (!name) return []
  const urls: string[] = []
  if (ext) urls.push(`${FK}/packages/${ext}/image/generals/${name}.jpg`)
  for (const p of ART_PKGS) {
    const u = `${FK}/packages/${p}/image/generals/${name}.jpg`
    if (!urls.includes(u)) urls.push(u)
  }
  return pruneToExisting(urls, false)
}

/** Dual-general portrait candidates: when a player has a deputy, both halves prefer the
 *  purpose-drawn split portrait `image/generals/dual/<name>.jpg` (PhotoBase.qml:76-78,
 *  112-113 → SkinBank.getGeneralExtraPic(name,"dual/") ?? getGeneralPicture(name)),
 *  falling back to the normal full portrait. We prepend the dual/ candidates (own ext
 *  then ART_PKGS) ahead of generalPicCandidates so the <img> onError chain walks
 *  dual → normal, exactly mirroring the QML `?? ` fallback. */
export function generalDualPicCandidates(name: string, ext?: string): string[] {
  if (!name) return []
  const dual: string[] = []
  if (ext) dual.push(`${FK}/packages/${ext}/image/generals/dual/${name}.jpg`)
  for (const p of ART_PKGS) {
    const u = `${FK}/packages/${p}/image/generals/dual/${name}.jpg`
    if (!dual.includes(u)) dual.push(u)
  }
  // dual/ paths first (pruned to existing), then the normal-portrait fallback chain.
  return [...pruneToExisting(dual, false), ...generalPicCandidates(name, ext)]
}

/** Chat emoji image: built-in /fk/image/emoji/<n>.png (RoomPage.qml addToChat
 *  replaces `{emojiN}` with <img .../image/emoji/N.png height=16>). */
export function emojiPic(n: string | number): string {
  return `${FK}/image/emoji/${n}.png`
}

/** Limit-skill background (LimitSkillItem.qml: SkinBank.limitSkillDir + type).
 *  type ∈ limit | limit-used | wake | switch | switch-yin. Dir = /image/photo/skill/. */
export function limitSkillBg(type: string): string {
  return `${FK}/image/photo/skill/${type}.png`
}

// ---- general-card chrome (built-in, /fk/image/card/general) ----------------
// GeneralCardItem.qml: a faction-framed portrait card used in the general-choose
// box. border = SkinBank.generalCardDir+'border'; the kingdom icon (top-left) =
// getGeneralCardDir(kingdom)+kingdom; back = generalCardDir+'card-back'.
const GENERAL_CARD = `${FK}/image/card/general`
/** Faction frame overlay for a general card. */
export function generalCardBorder(): string {
  return `${GENERAL_CARD}/border.png`
}
/** Kingdom icon (wei/shu/wu/qun/god) for the general-card top-left corner. */
export function kingdomIcon(kingdom?: string): string {
  return kingdom && KINGDOMS.has(kingdom) ? `${GENERAL_CARD}/${kingdom}.png` : ''
}

/** Full card art: packages/<ext>/image/card/<name>.png */
export function cardPic(name: string, ext?: string): string {
  return name ? pkgPath(ext, 'card', name, '.png') : ''
}

/** Candidate card-art URLs in QML getCardPicture order: the card's own extension
 *  first, then every bundled art package (searchPkgResource scan). The caller
 *  walks these on <img> error, mirroring SkinBank's "try ext → scan → unknown".
 *  De-duplicated; empty when no name. */
export function cardPicCandidates(name: string, ext?: string): string[] {
  if (!name) return []
  const urls: string[] = []
  if (ext) urls.push(`${FK}/packages/${ext}/image/card/${name}.png`)
  for (const p of ART_PKGS) {
    const u = `${FK}/packages/${p}/image/card/${name}.png`
    if (!urls.includes(u)) urls.push(u)
  }
  return pruneToExisting(urls)
}

/** Equip icon: packages/<ext>/image/card/equipIcon/<name>.png */
export function equipIcon(name: string, ext?: string): string {
  return name ? pkgPath(ext, 'card/equipIcon', name, '.png') : ''
}

/** Candidate equip-icon URLs in SkinBank.getEquipIcon order: the card's own
 *  extension first, then every bundled art package (searchPkgResource scan), then
 *  the built-in "unknown" icon. The caller walks these on <img> error so a horse
 *  whose card extension lacks horse.png (it only ships in standard_cards) still
 *  resolves instead of vanishing. De-duplicated; empty when no name. */
export function equipIconCandidates(name: string, ext?: string): string[] {
  if (!name) return []
  const urls: string[] = []
  if (ext) urls.push(`${FK}/packages/${ext}/image/card/equipIcon/${name}.png`)
  for (const p of ART_PKGS) {
    const u = `${FK}/packages/${p}/image/card/equipIcon/${name}.png`
    if (!urls.includes(u)) urls.push(u)
  }
  // Prune package candidates to those that exist (avoids per-miss 404s), then append
  // the built-in fallback (SkinBank.searchBuiltinPic equipIcon/unknown) — it's under
  // /fk/image (not /fk/packages) so it's always kept by the prune filter.
  const pruned = pruneToExisting(urls)
  pruned.push(`${FK}/image/card/equipIcon/unknown.png`)
  return pruned
}

/** Delayed-trick icon: packages/<ext>/image/card/delayedTrick/<name>.png */
export function delayedTrickPic(name: string, ext?: string): string {
  return name ? pkgPath(ext, 'card/delayedTrick', name, '.png') : ''
}
/** Built-in "JudgeSlot sealed" marker (DelayedTrickArea.qml sealed image). */
export function delayedTrickSealedPic(): string {
  return `${FK}/image/card/delayedTrick/sealed.png`
}

// ---- built-in chrome (always under /fk/image/photo) ------------------------
const KINGDOMS = new Set(['wei', 'shu', 'wu', 'qun', 'god', 'wild'])
/** Photo background by kingdom (falls back to unknown). */
export function photoBack(kingdom?: string): string {
  return `${PHOTO}/back/${kingdom && KINGDOMS.has(kingdom) ? kingdom : 'unknown'}.png`
}

const ROLES = new Set(['lord', 'loyalist', 'rebel', 'renegade', 'unknown'])
/** Role pic (lord/loyalist/rebel/renegade/unknown). */
export function rolePic(role?: string): string {
  return `${PHOTO}/role/${role && ROLES.has(role) ? role : 'unknown'}.png`
}

/** Magatama (HP bead) by state 0..3, optional -heg variant. */
export function magatama(state: number, heg = false): string {
  const s = Math.max(0, Math.min(3, state | 0))
  return `${PHOTO}/magatama/${s}${heg ? '-heg' : ''}.png`
}

/** Shield (armor) icon. */
export function shieldPic(): string {
  return `${PHOTO}/magatama/shield.png`
}

/** Death overlay by role (lord/loyalist/rebel/renegade/hidden). */
export function deathPic(role?: string): string {
  const r = role && ['lord', 'loyalist', 'rebel', 'renegade'].includes(role) ? role : 'hidden'
  return `${PHOTO}/death/${r}.png`
}

/** Dying overlay (Photo.qml dead/dying image source: deathDir + "saveme"). */
export function saveMePic(): string {
  return `${PHOTO}/death/saveme.png`
}

/** Face-turned overlay (Photo.qml faceturned, optional Heg variant). */
export function faceTurnedPic(heg = false): string {
  return `${PHOTO}/faceturned${heg ? '-heg' : ''}.png`
}

/** Chain (连环) overlay. */
export function chainPic(): string {
  return `${PHOTO}/chain.png`
}

// ---- emotion / animation sprites (image/anim/<emotion>/<frame>.png) ---------
// Mirrors SkinBank.pixAnimDir (built-in image/anim/) + package image/anim/. A frame
// is a PNG numbered 0..n-1 in the emotion's folder. The frame COUNT comes from the
// synced anim-manifest (anim.json) since the browser can't list a directory.
//
// An emotion is EITHER a bare name (built-in, e.g. "damage"/"judgebad"/"slash") OR a
// full path the server built (usecard.lua:20 "./packages/<pkg>/image/anim/<card>";
// crossbow.lua "./packages/standard_cards/image/anim/crossbow"). resolveAnim() turns
// either form into { key, base }: `key` indexes anim.json (frame count), `base` is
// the URL directory whose frames are base/0.png … base/(n-1).png.
export function resolveAnim(emotion: string): { key: string; base: string } {
  const m = emotion.match(/packages\/([^/]+)\/image\/anim\/(.+)$/)
  if (m) {
    const pkg = m[1]!, name = m[2]!.replace(/\/$/, '')
    return { key: `${pkg}/${name}`, base: `${FK}/packages/${pkg}/image/anim/${name}` }
  }
  // Bare name → built-in image/anim. QML setEmotion only checks pixAnimDir + AppPath,
  // never packages, so a bare name is always built-in.
  return { key: emotion, base: `${FK}/image/anim/${emotion}` }
}
/** Sprite frame URL for a resolved base dir (resolveAnim().base) + frame index. */
export function animFrameUrl(base: string, frame: number): string {
  return `${base}/${frame}.png`
}

/** Handcard-count background. */
export function handcardPic(): string {
  return `${PHOTO}/handcard.png`
}

/** Equipment-area background strip. */
export function equipBgPic(): string {
  return `${PHOTO}/equipbg.png`
}

// ---- card chrome (built-in, under /fk/image/card) --------------------------
/** Suit image (♠♥♣♦) for a card front overlay (PokerCard suitItem). */
export function suitPic(suit?: string): string {
  if (!suit || suit === 'nosuit') return ''
  return `${FK}/image/card/suit/${suit}.png`
}
/** Number image for the card front overlay (number/<red|black>/<n>.png). */
export function numberPic(n: number, color: string): string {
  if (!n || n < 1 || n > 13) return ''
  const c = color === 'red' ? 'red' : 'black'
  return `${FK}/image/card/number/${c}/${n}.png`
}
/** Card back. */
export function cardBackPic(): string {
  return `${FK}/image/card/card-back.png`
}
/** Picture-mark icon (PicMarkArea, @! marks): packages/<pkg>/image/mark/<mark>.png.
 *  SkinBank.getMarkPic scans packages; we try the art packages and let <img> onError
 *  fall back to a text chip (most @! marks live in extension packs, not core). */
export function markPicCandidates(mark: string): string[] {
  return ART_PKGS.map((p) => `${FK}/packages/${p}/image/mark/${mark}.png`)
}
/** "Chosen" marker overlaid on a selected card (BasicCard chosen.png). */
export function chosenPic(): string {
  return `${FK}/image/card/chosen.png`
}

/** Net-state icon (online/offline/...). */
export function statePic(state: string): string {
  return `${PHOTO}/state/${state}.png`
}

// ---- prefetch (PACE-2) -----------------------------------------------------
// Decode an image URL into the browser cache ahead of render so the WAAPI fly-in a
// beat later draws real art instead of a placeholder/late pop-in (the "card art can't
// keep up" symptom on a high-latency link). Best-effort, de-duplicated, never throws.
const prewarmedImg = new Set<string>()
/** Prewarm one image URL (Image() so it's decoded + cached, not just fetched). */
export function warmImage(url: string): void {
  if (!url || prewarmedImg.has(url)) return
  prewarmedImg.add(url)
  try { const img = new Image(); img.src = url } catch { /* SSR / no Image */ }
}
/** Prewarm a card's face art (first existing candidate, mirrors cardPicCandidates). */
export function warmCardPic(name: string, ext?: string): void {
  const [first] = cardPicCandidates(name, ext)
  if (first) warmImage(first)
}
