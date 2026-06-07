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
import { PhotoFocusBar } from './PhotoFocusBar.js'
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
      style={{ ...styles.wrap, left: pos.x, top: pos.y, transform: `scale(${pos.scale})`, transformOrigin: 'top left', cursor: selectable ? 'pointer' : 'default' }}
    >
    <div style={{ ...styles.photo, outline: targetOutline }}>
      {/* kingdom background frame */}
      <img src={photoBack(player.kingdom)} alt="" style={styles.back} draggable={false} onError={hideImg} />

      {/* general portrait(s) — clipped to the inner rounded area */}
      <div style={{ ...styles.portraitClip, filter: player.dead ? 'grayscale(1) brightness(0.6)' : 'none' }}>
        {hasGeneral ? (
          dual ? (
            <>
              <Portrait src={portrait(player.general!)} bg={kingdomBg} />
              <Portrait src={portrait(player.deputyGeneral!)} bg={kingdomBg} />
            </>
          ) : (
            <Portrait src={portrait(player.general!)} bg={kingdomBg} />
          )
        ) : (
          <div style={{ ...styles.placeholder, background: kingdomBg }} />
        )}
      </div>

      {/* general name — Photo root x:5 y:21, vertical (PhotoBase.qml generalName) */}
      <div style={styles.generalName}>{hasGeneral ? trName(player) : '未选将'}</div>

      {/* HP magatama (bottom-left) */}
      <div style={styles.hp}><HpBar hp={player.hp ?? 0} maxHp={player.maxHp ?? 0} shield={player.shield ?? 0} /></div>

      {/* role pic (top-right). RoleComboBox.qml value logic:
          hidden -> hidden; role_shown -> role; else roleVisible(pid) ? role : "unknown". */}
      {player.role && player.role !== 'hidden' && (
        <img src={rolePic(shownRole(player))} alt="" style={styles.role} draggable={false} onError={hideImg} />
      )}

      {/* equip strip (lower area) */}
      <div style={styles.equip}><EquipArea cids={player.equipCids ?? []} /></div>

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

      {/* per-player thinking countdown (Photo.qml progressBar, MoveFocus-driven) */}
      <PhotoFocusBar playerId={player.id} />
    </div>
      {/* judge (delayed-trick) icons — rendered OUTSIDE the clipped photo box so they
          can sit below the portrait without being cut off by overflow:hidden. */}
      <div style={styles.judge}><JudgeArea cids={player.judgeCids ?? []} /></div>
    </div>
  )
}

function Portrait({ src, bg }: { src: string; bg: string }) {
  // Portrait image fills its slot (single = full width, dual = 50% via flex). If
  // the art is missing we just show the kingdom-colored block (name is drawn at
  // the Photo root, like PhotoBase.qml generalName).
  return (
    <div style={{ ...styles.portrait, background: bg }}>
      {src && <img src={src} alt="" style={styles.portraitImg} draggable={false} onError={hideImg} />}
    </div>
  )
}

// General name shown vertically (PhotoBase generalName text = Lua.tr(general)).
// Dual general: "main/deputy".
function trName(player: GamePlayer): string {
  const m = tr(player.general!)
  return player.deputyGeneral ? `${m}/${tr(player.deputyGeneral)}` : m
}

// RoleComboBox.qml value: role==='hidden' → 'hidden'; role_shown → role;
// else roleVisible ? role : 'unknown'. roleVisible comes from the VM
// (Self:roleVisible(p)); Self always sees itself (player.lua:1711).
function shownRole(player: GamePlayer): string {
  const role = player.role ?? 'unknown'
  if (role === 'hidden') return 'hidden'
  if (player.role_shown) return role
  return player.roleVisible ? role : 'unknown'
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
  wrap: { position: 'absolute', width: PHOTO_W, height: PHOTO_H, color: '#eee', fontFamily: 'system-ui, sans-serif' },
  photo: { position: 'absolute', inset: 0, borderRadius: 8, overflow: 'hidden', background: '#14110c' },
  back: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  portraitClip: { position: 'absolute', left: 4, top: 3, right: 4, bottom: 22, borderRadius: 6, overflow: 'hidden', display: 'flex' },
  portrait: { position: 'relative', height: '100%', flex: 1, overflow: 'hidden' },
  portraitImg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  generalName: { position: 'absolute', left: 4, top: 15, width: 15, zIndex: 5, fontSize: 13, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: '13px', textShadow: '0 1px 2px #000, 0 0 3px #000', writingMode: 'vertical-rl', letterSpacing: 0 },
  placeholder: { width: '100%', height: '100%' },
  // HP magatama column (Photo.qml HpBar: x:6, bottomMargin:27 — far-left, a column
  // rising upward). The delayed-trick row sits 19px lower and overlaps the lowest
  // bead (trick drawn on top). We keep QML's absolute bottoms shifted up by our
  // 20px name bar (a deviation: QML puts the name at top): 27 → 47.
  hp: { position: 'absolute', left: 5, bottom: 27, zIndex: 4 },
  role: { position: 'absolute', top: -2, right: -2, width: 30, height: 33, zIndex: 4 },
  equip: { position: 'absolute', left: 22, right: 3, bottom: 40, zIndex: 3 },
  // judge (delayed-trick) row — rendered outside the clipped photo box (in the
  // unclipped wrap), sitting just BELOW the photo's bottom edge so the icons hang
  // under the portrait. Was bottom:22 inside the clip; +60px down → ~2px below.
  judge: { position: 'absolute', left: 2, right: 2, top: PHOTO_H - 3, zIndex: 6 },
  chain: { position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)', width: '92%', zIndex: 2, opacity: 0.9 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px', background: 'rgba(0,0,0,.6)', zIndex: 5 },
  name: { fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  seat: { fontSize: 11, color: '#d4af37', fontWeight: 700 },
  handcard: { position: 'absolute', right: 2, bottom: 22, minWidth: 16, height: 18, padding: '0 3px', background: 'rgba(0,0,0,.7)', borderRadius: 3, color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', zIndex: 6 },
  death: { position: 'absolute', left: '50%', top: '44%', transform: 'translate(-50%,-50%)', width: 56, height: 56, zIndex: 7 },
}
