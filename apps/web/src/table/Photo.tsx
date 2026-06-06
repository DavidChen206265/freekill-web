// Photo.tsx — one player's seat card. Placeholder visuals (general name + color
// block; image art comes later). Renders HP / role / kingdom / handcards / seat
// from gameStore, positioned by seatLayout. Absolute logical coords.

import type { GamePlayer } from '../stores/gameStore.js'
import { seatPosition, PHOTO_WIDTH, PHOTO_HEIGHT } from './seatLayout.js'
import { useInteractionStore } from '../stores/interactionStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { tr } from '../i18n/zh.js'

const PHOTO_W = PHOTO_WIDTH
const PHOTO_H = PHOTO_HEIGHT

const ROLE_COLOR: Record<string, string> = {
  lord: '#d4af37', loyalist: '#c0392b', rebel: '#27ae60', renegade: '#8e44ad',
}
const KINGDOM_COLOR: Record<string, string> = {
  wei: '#3b5b8c', shu: '#9c3b3b', wu: '#3b7d5b', qun: '#7a6a3b', god: '#7a3b7a',
}

export function Photo({ player, playerNum, isSelf }: {
  player: GamePlayer
  playerNum: number
  isSelf: boolean
}) {
  const pos = seatPosition(player.index, playerNum)
  const general = player.general && player.general !== '' ? tr(player.general) : '(未选将)'
  const kingdomBg = (player.kingdom && KINGDOM_COLOR[player.kingdom]) || '#2a2a30'
  // Target selection state (when this player is a candidate target of a request).
  const targetState = useInteractionStore((s) => s.photos[player.id])
  const interact = useVmStore((s) => s.interact)
  const selectable = !!targetState && (targetState.enabled || targetState.selected)
  const onClick = () => {
    if (!selectable) return
    void interact('Photo', player.id, 'click', { selected: !targetState?.selected })
  }
  const targetOutline = targetState?.selected ? '3px solid #e74c3c' : selectable ? '3px solid #2ecc71' : isSelf ? '2px solid #f1c40f' : 'none'

  return (
    <div
      onClick={onClick}
      style={{ ...styles.photo, left: pos.x, top: pos.y, transform: `scale(${pos.scale})`, transformOrigin: 'top left', opacity: player.dead ? 0.4 : 1, outline: targetOutline, cursor: selectable ? 'pointer' : 'default' }}
    >
      <div style={{ ...styles.art, background: kingdomBg }}>
        <span style={styles.general}>{general}</span>
        {player.deputyGeneral && <span style={styles.deputy}>/ {tr(player.deputyGeneral)}</span>}
      </div>
      <div style={styles.bar}>
        <span style={styles.name}>{player.name || `P${player.id}`}</span>
        {player.role && <span style={{ ...styles.role, background: ROLE_COLOR[player.role] ?? '#555' }}>{roleZh(player.role)}</span>}
      </div>
      <div style={styles.statRow}>
        <span style={styles.hp}>{'♥'.repeat(Math.max(0, player.hp ?? 0))}<span style={styles.hpDim}>{'♡'.repeat(Math.max(0, (player.maxHp ?? 0) - (player.hp ?? 0)))}</span></span>
        <span style={styles.seat}>{seatChr(player.seat)}</span>
      </div>
      {player.dead && <div style={styles.dead}>阵亡</div>}
    </div>
  )
}

// Seat shown as a Chinese numeral, matching Photo.qml (seatChr[seatNumber-1]).
// QML's model defaults seatNumber to 1, so an unassigned seat (waiting room,
// VM seat 0/undefined) shows 一.
const SEAT_CHR = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
function seatChr(seat?: number): string {
  const n = seat && seat > 0 ? seat : 1
  return SEAT_CHR[n - 1] ?? String(n)
}

function roleZh(role: string): string {
  return ({ lord: '主', loyalist: '忠', rebel: '反', renegade: '内' } as Record<string, string>)[role] ?? role
}

const styles: Record<string, React.CSSProperties> = {
  photo: { position: 'absolute', width: PHOTO_W, height: PHOTO_H, borderRadius: 6, overflow: 'hidden', background: '#1b1b1f', color: '#eee', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' },
  art: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 },
  general: { fontSize: 16, fontWeight: 700, textShadow: '0 1px 2px #000' },
  deputy: { fontSize: 11, opacity: 0.85 },
  bar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 4px', background: 'rgba(0,0,0,.5)' },
  name: { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  role: { fontSize: 11, borderRadius: 3, padding: '0 4px', marginLeft: 4 },
  statRow: { display: 'flex', justifyContent: 'space-between', padding: '2px 4px', background: 'rgba(0,0,0,.35)' },
  hp: { fontSize: 12, color: '#e74c3c', letterSpacing: 1 },
  hpDim: { color: '#555' },
  seat: { fontSize: 11, color: '#aaa' },
  dead: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,.4)' },
}
