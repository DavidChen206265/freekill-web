// processPrompt.ts — 1:1 port of RoomLogic.js processPrompt() + getPlayerStr().
// A prompt is a ":"-joined string: "<key>:<src>:<dest>:<arg1>:<arg2>...". The key
// is translated, then %src/%dest are replaced with player names and %arg/%argN
// with translated args. Used for the operation prompt above the OK/Cancel bar.

import { tr } from '../i18n/zh.js'
import { useGameStore } from '../stores/gameStore.js'

// getPlayerStr(playerid): the player's general name (main/deputy), with a "(你)"
// suffix for self. Hidden generals (anjiang) fall back to "seatN" — we approximate
// with the screen name when the general isn't known yet.
function getPlayerStr(playerid: number): string {
  const p = useGameStore.getState().players[playerid]
  if (!p) return ''
  const isSelf = playerid === useGameStore.getState().selfId
  const selfSuffix = isSelf ? tr('playerstr_self') : ''
  const hidden = !p.general || p.general === 'anjiang'
  if (hidden) {
    const seat = p.seat ? tr(`seat#${p.seat}`) : (p.name || `P${playerid}`)
    return seat + selfSuffix
  }
  let ret = tr(p.general!)
  if (p.deputyGeneral && p.deputyGeneral !== '') ret += '/' + tr(p.deputyGeneral)
  return ret + selfSuffix
}

/** Translate + interpolate a prompt string (RoomLogic.js processPrompt). Returns
 *  the localized text; a bare key (no ":") is just translated. */
export function processPrompt(prompt: string): string {
  if (!prompt) return ''
  const data = prompt.split(':')
  let raw = tr(data[0]!)
  const src = parseInt(data[1] ?? '', 10)
  const dest = parseInt(data[2] ?? '', 10)
  if (raw.includes('%src')) raw = raw.replace(/%src/g, getPlayerStr(src))
  if (raw.includes('%dest')) raw = raw.replace(/%dest/g, getPlayerStr(dest))
  if (data.length > 3) {
    for (let i = data.length - 1; i > 3; i--) {
      raw = raw.replace(new RegExp('%arg' + (i - 2), 'g'), tr(data[i]!))
    }
    raw = raw.replace(/%arg/g, tr(data[3]!))
  }
  return raw
}
