// EquipArea.tsx — equipment as 5 fixed slots (treasure / weapon / armor / +1 horse
// / -1 horse), mirroring EquipArea.qml. Each equip card is placed into its slot by
// subtype; horses use the "horse" icon. Icon path needs the CARD's extension
// (package), not the general's. A slot renders when it holds a card OR is sealed
// (EquipItem.qml: a sealed slot shows a grey overlay even when empty).

import { useCardFaceStore, suitSymbol, isRedSuit, numberStr } from '../stores/cardFaceStore.js'
import type { CardFace } from '../vm/clientVm.js'
import { equipIconCandidates } from './skin.js'
import { tr } from '../i18n/zh.js'

// slot order matches EquipArea.qml subtypes[]; sealedKey = Player.<X>Slot name.
const SLOTS: { subtype: string; icon?: string; sealedKey: string }[] = [
  { subtype: 'treasure', sealedKey: 'TreasureSlot' },
  { subtype: 'weapon', sealedKey: 'WeaponSlot' },
  { subtype: 'armor', sealedKey: 'ArmorSlot' },
  { subtype: 'defensive_ride', icon: 'horse', sealedKey: 'DefensiveRideSlot' },
  { subtype: 'offensive_ride', icon: 'horse', sealedKey: 'OffensiveRideSlot' },
]

export function EquipArea({ cids, sealedSlots = [] }: { cids: number[]; sealedSlots?: string[] }) {
  const faces = useCardFaceStore((s) => s.faces)
  if (!cids.length && sealedSlots.length === 0) return null

  // Map each equip card into its slot by subtype.
  const bySlot: Record<string, { cid: number; face: CardFace }> = {}
  for (const cid of cids) {
    const face = faces[cid]
    if (face?.subtype) bySlot[face.subtype] = { cid, face }
  }

  return (
    <div style={styles.col}>
      {SLOTS.map(({ subtype, icon, sealedKey }) => {
        const entry = bySlot[subtype]
        const sealed = sealedSlots.includes(sealedKey)
        if (!entry && !sealed) return null
        // Sealed but empty: just the grey overlay row (EquipItem sealed rect).
        if (!entry) {
          return <div key={subtype} style={{ ...styles.row, position: 'relative' }}><div style={styles.sealed} /></div>
        }
        const { cid, face } = entry
        // Horses use the generic "horse" icon name; weapons/armor/treasure use the
        // card's own name. getEquipIcon falls back across packages → unknown, so we
        // walk candidates on <img> error (some mounts' extension lacks horse.png).
        const iconName = icon || face.name
        const candidates = equipIconCandidates(iconName, face.extension)
        const red = isRedSuit(face.suit)
        // Label: mounts show the distance modifier (+1/-1) followed by the mount's
        // NAME (user request "+1和-1后应该显示马的名称"); other equips show the
        // (possibly virtual) card name. QML showed only "+1"/"-1" for mounts.
        const mountSign = subtype === 'defensive_ride' ? '+1' : '-1'
        const label = icon === 'horse'
          ? `${mountSign} ${tr(face.virt_name || face.name)}`
          : tr(face.virt_name || face.name)
        return (
          <div key={cid} style={{ ...styles.row, position: 'relative' }}>
            <img src={candidates[0]} alt="" style={styles.icon} draggable={false} data-i="0" onError={(e) => walkIcon(e, candidates)} />
            <span style={styles.name}>{label}</span>
            <span style={{ ...styles.suit, color: red ? '#c0392b' : '#eee' }}>{suitSymbol(face.suit)}{numberStr(face.number)}</span>
            {/* sealed (废除) slot: grey overlay (EquipItem.qml rect #CCC @ .8) */}
            {sealed && <div style={styles.sealed} />}
          </div>
        )
      })}
    </div>
  )
}

function walkIcon(e: React.SyntheticEvent<HTMLImageElement>, candidates: string[]) {
  const img = e.currentTarget as HTMLImageElement
  const i = Number(img.dataset.i ?? '0') + 1
  if (i < candidates.length) {
    img.dataset.i = String(i)
    img.src = candidates[i]!
  } else {
    img.style.display = 'none' // exhausted all fallbacks (shouldn't happen: unknown.png)
  }
}

const styles: Record<string, React.CSSProperties> = {
  col: { display: 'flex', flexDirection: 'column', gap: 1, width: '100%' },
  row: { display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,.5)', borderRadius: 2, padding: '0 2px', height: 13, fontSize: 10, lineHeight: '13px' },
  icon: { width: 11, height: 11, objectFit: 'contain' },
  name: { color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  suit: { fontWeight: 700 },
  // sealed (废除) slot overlay — EquipItem.qml rect color #CCC opacity .8.
  sealed: { position: 'absolute', inset: 0, borderRadius: 2, background: '#CCC', opacity: 0.8 },
}
