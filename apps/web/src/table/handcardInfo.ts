export interface HandcardCountLike {
  handcardNum?: number
  maxCard?: number
  hp?: number
}

export interface HandcardPreviewLike {
  visible: boolean
  name: string
}

const HANDCARD_COUNT_FONT_SCALE = 2 / 3

export function handcardText(player: HandcardCountLike): string {
  const n = player.handcardNum ?? 0
  const max = player.maxCard
  if (max === undefined || max === player.hp || (player.hp ?? 0) < 0) return String(n)
  return `${n}/${max < 900 ? max : '∞'}`
}

export function handcardFontSize(player: HandcardCountLike): number {
  const max = player.maxCard
  const base = max === undefined || max === player.hp || (player.hp ?? 0) < 0 ? 24 : 20
  return Math.round(base * HANDCARD_COUNT_FONT_SCALE)
}

export function previewLines(cards: HandcardPreviewLike[], translate: (key: string) => string = (key) => key): string[] {
  const out: string[] = []
  for (const c of cards) {
    if (out.length >= 4) { out.push('...'); break }
    if (c.visible && c.name) out.push(translate(c.name).slice(0, 2))
  }
  if (out.length < 5) {
    const unknown = cards.length - out.length
    for (let i = 0; i < unknown; i++) {
      if (out.length >= 4) { out.push('...'); break }
      out.push('?')
    }
  }
  return out
}
