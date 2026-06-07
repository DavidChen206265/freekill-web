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
// Packages that actually carry general/card art (mirrors the sync set).
const ART_PKGS = ['standard', 'standard_cards', 'maneuvering']

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

/** Full card art: packages/<ext>/image/card/<name>.png */
export function cardPic(name: string, ext?: string): string {
  return name ? pkgPath(ext, 'card', name, '.png') : ''
}

/** Equip icon: packages/<ext>/image/card/equipIcon/<name>.png */
export function equipIcon(name: string, ext?: string): string {
  return name ? pkgPath(ext, 'card/equipIcon', name, '.png') : ''
}

/** Delayed-trick icon: packages/<ext>/image/card/delayedTrick/<name>.png */
export function delayedTrickPic(name: string, ext?: string): string {
  return name ? pkgPath(ext, 'card/delayedTrick', name, '.png') : ''
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

/** Chain (连环) overlay. */
export function chainPic(): string {
  return `${PHOTO}/chain.png`
}

/** Handcard-count background. */
export function handcardPic(): string {
  return `${PHOTO}/handcard.png`
}

/** Equipment-area background strip. */
export function equipBgPic(): string {
  return `${PHOTO}/equipbg.png`
}

/** Net-state icon (online/offline/...). */
export function statePic(state: string): string {
  return `${PHOTO}/state/${state}.png`
}

export { ART_PKGS }
