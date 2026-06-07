// HpBar.tsx — HP shown as magatama beads (NOT a bar), mirroring HpBar.qml.
// ≤4 maxHp: render maxHp beads, the last `hp` of them "filled" (color by current
// hp: 1=red img, 2=yellow img, 3+=green img), the rest empty (img 0). >4 maxHp:
// one bead + "hp/maxHp" text. Shield (护甲) stacks on top when > 0.

import { magatama, shieldPic } from './skin.js'

// per-bead state: filled beads share the color of the current hp level (capped 3).
function beadState(index: number, hp: number, maxHp: number): number {
  if (maxHp - 1 - index >= hp) return 0 // empty
  if (hp <= 0) return 0
  return hp >= 3 ? 3 : hp
}

const HP_TEXT_COLOR = ['#F4180E', '#F4180E', '#E3B006', '#25EC27'] // [_, 1, 2, 3+]

export function HpBar({ hp, maxHp, shield }: { hp: number; maxHp: number; shield: number }) {
  const useText = maxHp > 4
  return (
    <div style={styles.col}>
      {shield > 0 && (
        <div style={styles.shield}>
          <img src={shieldPic()} alt="" style={styles.shieldImg} draggable={false} />
          <span style={styles.shieldNum}>{shield}</span>
        </div>
      )}
      {useText ? (
        <div style={styles.textWrap}>
          <img src={magatama(hp >= 3 || hp >= maxHp ? 3 : Math.max(0, hp))} alt="" style={styles.bead} draggable={false} />
          <span style={{ ...styles.hpText, color: HP_TEXT_COLOR[Math.min(3, Math.max(1, hp))] }}>{hp}</span>
          <span style={styles.slash}>/</span>
          <span style={styles.hpText}>{maxHp}</span>
        </div>
      ) : (
        Array.from({ length: Math.max(0, maxHp) }, (_, i) => (
          <img key={i} src={magatama(beadState(i, hp, maxHp))} alt="" style={styles.bead} draggable={false} />
        ))
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  col: { display: 'flex', flexDirection: 'column-reverse', alignItems: 'center', gap: 0 },
  bead: { width: 14, height: 14, objectFit: 'contain' },
  shield: { position: 'relative', width: 15, height: 16, marginBottom: 1 },
  shieldImg: { width: 15, height: 16 },
  shieldNum: { position: 'absolute', top: -2, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: '#fff', fontWeight: 700, textShadow: '0 0 2px #000' },
  textWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 },
  hpText: { fontSize: 14, fontWeight: 800, color: '#25EC27', textShadow: '0 0 2px #000' },
  slash: { fontSize: 11, color: '#fff', transform: 'rotate(40deg)' },
}
