// Photo.tsx — one player's seat, layered to mirror Photo.qml/PhotoBase.qml:
//   kingdom background → general portrait(s) (single full / dual split) → rounded
//   clip → HP magatama (left) → role pic (top-right) → equip strip + judge icons
//   → name/seat bar → chain/death overlays → target-select highlight.
// Real art from skin.ts (portraits/role/magatama); falls back to a kingdom-colored
// block + name when a portrait isn't available. Data from gameStore (VM mirror).

import type { GamePlayer } from '../stores/gameStore.js'
import { seatPosition, PHOTO_WIDTH, PHOTO_HEIGHT } from './seatLayout.js'
import { useInteractionStore } from '../stores/interactionStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { useCardFaceStore } from '../stores/cardFaceStore.js'
import { generalPic, photoBack, rolePic, deathPic, chainPic } from './skin.js'
import { HpBar } from './HpBar.js'
import { EquipArea } from './EquipArea.js'
import { JudgeArea } from './JudgeArea.js'
import { tr } from '../i18n/zh.js'

const PHOTO_W = PHOTO_WIDTH
const PHOTO_H = PHOTO_HEIGHT
const KINGDOM_COLOR: Record<string, string> = {
  wei: '#3b5b8c', shu: '#9c3b3b', wu: '#3b7d5b', qun: '#7a6a3b', god: '#7a3b7a',
}

export function Photo({ player, playerNum, isSelf }: {
  player: GamePlayer
  playerNum: number
  isSelf: boolean
}) {
  const pos = seatPosition(player.index, playerNum)
  const generals = useCardFaceStore((s) => s.generals)
  const targetState = useInteractionStore((s) => s.photos[player.id])
  const interact = useVmStore((s) => s.interact)

  const ext = (name: string) => generals[name]?.extension
  const hasGeneral = !!player.general && player.general !== ''
  const selectable = !!targetState && (targetState.enabled || targetState.selected)
  const onClick = () => {
    if (!selectable) return
    void interact('Photo', player.id, 'click', { selected: !targetState?.selected })
  }
  const targetOutline = targetState?.selected ? '3px solid #e74c3c'
    : selectable ? '3px solid #2ecc71' : isSelf ? '2px solid #f1c40f' : 'none'

  const kingdomBg = (player.kingdom && KINGDOM_COLOR[player.kingdom]) || '#2a2a30'
  const dual = !!player.deputyGeneral
  const portrait = (name: string) => generalPic(name, ext(name))

  return (
    <div
      onClick={onClick}
      style={{ ...styles.photo, left: pos.x, top: pos.y, transform: `scale(${pos.scale})`, transformOrigin: 'top left', outline: targetOutline, cursor: selectable ? 'pointer' : 'default' }}
    >
      {/* kingdom background frame */}
      <img src={photoBack(player.kingdom)} alt="" style={styles.back} draggable={false} onError={hideImg} />

      {/* general portrait(s) — clipped to the inner rounded area */}
      <div style={{ ...styles.portraitClip, filter: player.dead ? 'grayscale(1) brightness(0.6)' : 'none' }}>
        {hasGeneral ? (
          dual ? (
            <>
              <Portrait src={portrait(player.general!)} bg={kingdomBg} name={tr(player.general!)} half />
              <Portrait src={portrait(player.deputyGeneral!)} bg={kingdomBg} name={tr(player.deputyGeneral!)} half />
            </>
          ) : (
            <Portrait src={portrait(player.general!)} bg={kingdomBg} name={tr(player.general!)} />
          )
        ) : (
          <div style={{ ...styles.placeholder, background: kingdomBg }}><span style={styles.phName}>(未选将)</span></div>
        )}
      </div>

      {/* HP magatama (bottom-left) */}
      <div style={styles.hp}><HpBar hp={player.hp ?? 0} maxHp={player.maxHp ?? 0} shield={player.shield ?? 0} /></div>

      {/* role pic (top-right) */}
      {player.role && player.role !== 'hidden' && (
        <img src={rolePic(player.role_shown === false && !isSelf ? 'unknown' : player.role)} alt="" style={styles.role} draggable={false} onError={hideImg} />
      )}

      {/* equip strip (lower area) + judge icons (top-left) */}
      <div style={styles.equip}><EquipArea cids={player.equipCids ?? []} ext={ext} /></div>
      <div style={styles.judge}><JudgeArea cids={player.judgeCids ?? []} ext={ext} /></div>

      {/* chain overlay */}
      {player.chained && <img src={chainPic()} alt="" style={styles.chain} draggable={false} onError={hideImg} />}

      {/* name + seat bar */}
      <div style={styles.bar}>
        <span style={styles.name}>{player.name || `P${player.id}`}</span>
        <span style={styles.seat}>{seatChr(player.seat)}</span>
      </div>

      {/* handcard count badge (bottom-left corner) */}
      {player.handcardNum !== undefined && player.handcardNum > 0 && (
        <div style={styles.handcard}>{player.handcardNum}</div>
      )}

      {/* death overlay */}
      {player.dead && (
        <img src={deathPic(player.role)} alt="阵亡" style={styles.death} draggable={false} onError={hideImg} />
      )}
    </div>
  )
}

function Portrait({ src, bg, name, half }: { src: string; bg: string; name: string; half?: boolean }) {
  // Show the portrait image; if it fails or is absent, fall back to a colored
  // block with the (translated) general name so the seat is always legible.
  return (
    <div style={{ ...styles.portrait, width: half ? '50%' : '100%', background: bg }}>
      {src && <img src={src} alt={name} style={styles.portraitImg} draggable={false} onError={hideImg} />}
      <span style={styles.portraitName}>{name}</span>
    </div>
  )
}

function hideImg(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
}

const SEAT_CHR = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
function seatChr(seat?: number): string {
  const n = seat && seat > 0 ? seat : 1
  return SEAT_CHR[n - 1] ?? String(n)
}

const styles: Record<string, React.CSSProperties> = {
  photo: { position: 'absolute', width: PHOTO_W, height: PHOTO_H, borderRadius: 8, overflow: 'hidden', background: '#14110c', color: '#eee', fontFamily: 'system-ui, sans-serif' },
  back: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  portraitClip: { position: 'absolute', left: 4, top: 3, right: 4, bottom: 22, borderRadius: 6, overflow: 'hidden', display: 'flex' },
  portrait: { position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' },
  portraitImg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  portraitName: { position: 'relative', fontSize: 13, fontWeight: 700, textShadow: '0 1px 3px #000, 0 0 4px #000', padding: '0 1px', writingMode: 'vertical-rl', alignSelf: 'flex-start', marginTop: 3, marginLeft: 1 },
  placeholder: { width: '100%', height: '100%', display: 'grid', placeItems: 'center' },
  phName: { fontSize: 13, fontWeight: 700 },
  hp: { position: 'absolute', left: 2, bottom: 24, zIndex: 3 },
  role: { position: 'absolute', top: -2, right: -2, width: 30, height: 33, zIndex: 4 },
  equip: { position: 'absolute', left: 20, right: 4, bottom: 22, zIndex: 3 },
  judge: { position: 'absolute', left: 2, top: 2, zIndex: 3 },
  chain: { position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)', width: '92%', zIndex: 2, opacity: 0.9 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px', background: 'rgba(0,0,0,.6)', zIndex: 5 },
  name: { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  seat: { fontSize: 11, color: '#d4af37', fontWeight: 700 },
  handcard: { position: 'absolute', right: 2, bottom: 22, minWidth: 16, height: 18, padding: '0 3px', background: 'rgba(0,0,0,.7)', borderRadius: 3, color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', zIndex: 6 },
  death: { position: 'absolute', left: '50%', top: '44%', transform: 'translate(-50%,-50%)', width: 56, height: 56, zIndex: 7 },
}
