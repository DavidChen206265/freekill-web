// EquipArea.tsx — equipment as 5 fixed slots (treasure / weapon / armor / +1 horse
// / -1 horse), mirroring EquipArea.qml. Each equip card is placed into its slot by
// subtype; horses use the "horse" icon. Icon path needs the CARD's extension
// (package), not the general's. Empty slots render nothing.

import { useCardFaceStore, suitSymbol, isRedSuit, numberStr } from '../stores/cardFaceStore.js'
import type { CardFace } from '../vm/clientVm.js'
import { equipIcon } from './skin.js'
import { tr } from '../i18n/zh.js'

// slot order matches EquipArea.qml subtypes[]
const SLOTS: { subtype: string; icon?: string }[] = [
  { subtype: 'treasure' },
  { subtype: 'weapon' },
  { subtype: 'armor' },
  { subtype: 'defensive_ride', icon: 'horse' },
  { subtype: 'offensive_ride', icon: 'horse' },
]

export function EquipArea({ cids }: { cids: number[] }) {
  const faces = useCardFaceStore((s) => s.faces)
  if (!cids.length) return null

  // Map each equip card into its slot by subtype.
  const bySlot: Record<string, { cid: number; face: CardFace }> = {}
  for (const cid of cids) {
    const face = faces[cid]
    if (face?.subtype) bySlot[face.subtype] = { cid, face }
  }

  return (
    <div style={styles.col}>
      {SLOTS.map(({ subtype, icon }) => {
        const entry = bySlot[subtype]
        if (!entry) return null
        const { cid, face } = entry
        const iconUrl = equipIcon(icon || face.name, face.extension)
        const red = isRedSuit(face.suit)
        const label = icon === 'horse'
          ? (subtype === 'defensive_ride' ? '+1' : '-1')
          : tr(face.virt_name || face.name)
        return (
          <div key={cid} style={styles.row}>
            {iconUrl && <img src={iconUrl} alt="" style={styles.icon} draggable={false} onError={hideImg} />}
            <span style={styles.name}>{label}</span>
            <span style={{ ...styles.suit, color: red ? '#c0392b' : '#eee' }}>{suitSymbol(face.suit)}{numberStr(face.number)}</span>
          </div>
        )
      })}
    </div>
  )
}

function hideImg(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.currentTarget as HTMLImageElement).style.display = 'none'
}

const styles: Record<string, React.CSSProperties> = {
  col: { display: 'flex', flexDirection: 'column', gap: 1, width: '100%' },
  row: { display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,.5)', borderRadius: 2, padding: '0 2px', height: 13, fontSize: 10, lineHeight: '13px' },
  icon: { width: 11, height: 11, objectFit: 'contain' },
  name: { color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  suit: { fontWeight: 700 },
}
