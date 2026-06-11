// GeneralCard.tsx — faction-framed general portrait card for the choose-general
// box, porting GeneralCardItem.qml (93×130). Layers (bottom→top, mirroring QML):
//   portrait (cardFrontSource = SkinBank.getGeneralPicture)  — fills the card
//   border   (generalCardDir+'border')                       — faction frame
//   kingdom icon (getGeneralCardDir(kingdom)+kingdom)         — top-left, scale .6
//   name     (PhotoBase generalName: x:3 y:28, vertical, LiSu, black outline)
// Missing portrait falls back to a kingdom-tinted block + name (we never invent art).

import { generalPic, generalCardBorder, kingdomIcon } from './skin.js'
import { useCardFaceStore } from '../stores/cardFaceStore.js'
import { useLongPress } from './useLongPress.js'
import { tr } from '../i18n/zh.js'

const KINGDOM_COLOR: Record<string, string> = {
  wei: '#3b6ea5', shu: '#a5453b', wu: '#3ba558', qun: '#8a7a3b', god: '#7a3ba5', wild: '#555',
}

export function GeneralCard({ name, selected, disabled, onClick, onViewDetail, width = 93, height = 130 }: {
  name: string
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  // IG-6: right-click (desktop) / long-press (mobile) to view this general's skills.
  onViewDetail?: (name: string) => void
  width?: number
  height?: number
}) {
  const info = useCardFaceStore((s) => s.generals[name])
  const kingdom = info?.kingdom
  const portrait = generalPic(name, info?.extension)
  const bg = (kingdom && KINGDOM_COLOR[kingdom]) || '#2a2a30'
  const scale = width / 93

  // Long-press opens the skill detail (mirrors BasicItem.qml long-press → rightClicked).
  const lp = useLongPress(() => onViewDetail?.(name))
  const handleClick = () => {
    if (lp.consumeFired()) return // a long-press just opened detail — skip selection
    onClick?.()
  }
  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onViewDetail) return
    e.preventDefault()
    onViewDetail(name)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={lp.onPointerDown}
      onPointerMove={lp.onPointerMove}
      onPointerUp={lp.onPointerUp}
      onPointerLeave={lp.onPointerCancel}
      style={{
        ...styles.card, width, height,
        outline: selected ? '3px solid #f1c40f' : 'none',
        filter: disabled ? 'grayscale(1) brightness(0.5)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {/* portrait (fills card); kingdom-tinted block if art missing */}
      {portrait
        ? <img src={portrait} alt="" style={styles.portrait} draggable={false} onError={hidePortrait} />
        : <div style={{ ...styles.portrait, background: bg }} />}
      {/* faction frame */}
      <img src={generalCardBorder()} alt="" style={styles.border} draggable={false} onError={hideImg} />
      {/* kingdom icon, top-left (GeneralCardItem.qml: x ~ -2, scale .6) */}
      {kingdomIcon(kingdom) && (
        <img src={kingdomIcon(kingdom)} alt="" style={{ ...styles.kingdom, width: 34 * scale, height: 34 * scale }} draggable={false} onError={hideImg} />
      )}
      {/* vertical name (PhotoBase generalName), top-left under the kingdom icon */}
      <span style={{ ...styles.name, left: 4 * scale, top: 28 * scale, fontSize: 16 * scale, lineHeight: `${16 * scale}px` }}>{tr(name)}</span>
    </button>
  )
}

function hidePortrait(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
}
function hideImg(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.currentTarget as HTMLImageElement).style.display = 'none'
}

const styles: Record<string, React.CSSProperties> = {
  card: { position: 'relative', padding: 0, border: 'none', background: '#1D1E19', borderRadius: 6, overflow: 'hidden' },
  portrait: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  border: { position: 'absolute', inset: -1, width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', objectFit: 'fill', pointerEvents: 'none' },
  kingdom: { position: 'absolute', left: -2, top: -2, objectFit: 'contain' },
  name: { position: 'absolute', width: 16, color: '#fff', fontWeight: 700, textAlign: 'center', writingMode: 'vertical-rl', letterSpacing: 0, textShadow: '0 1px 2px #000, 0 0 3px #000', pointerEvents: 'none' },
}
