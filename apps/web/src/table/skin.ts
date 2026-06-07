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
  return urls
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

/** Net-state icon (online/offline/...). */
export function statePic(state: string): string {
  return `${PHOTO}/state/${state}.png`
}

export { ART_PKGS }
