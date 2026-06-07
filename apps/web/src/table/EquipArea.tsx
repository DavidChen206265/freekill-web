// EquipArea.tsx — equipment shown as small icon+name+suit+number rows inside the
// Photo, mirroring EquipArea.qml (Column: treasure/weapon/armor/+1/-1 horse).
// Reads each equip card's face from cardFaceStore; icon from skin.equipIcon.
// We classify by the card subtype the VM provides (type/subtype on the face).

import { useCardFaceStore, suitSymbol, isRedSuit, numberStr } from '../stores/cardFaceStore.js'
import { equipIcon } from './skin.js'
import { tr } from '../i18n/zh.js'

export function EquipArea({ cids, ext }: { cids: number[]; ext: (name: string) => string | undefined }) {
  const faces = useCardFaceStore((s) => s.faces)
  if (!cids.length) return null
  return (
    <div style={styles.col}>
      {cids.map((cid) => {
        const face = faces[cid]
        if (!face) return <div key={cid} style={styles.row}><span style={styles.name}>{cid}</span></div>
        const icon = equipIcon(face.name, ext(face.name))
        const red = isRedSuit(face.suit)
        return (
          <div key={cid} style={styles.row}>
            {icon && <img src={icon} alt="" style={styles.icon} draggable={false} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />}
            <span style={styles.name}>{tr(face.virt_name || face.name)}</span>
            <span style={{ ...styles.suit, color: red ? '#c0392b' : '#eee' }}>{suitSymbol(face.suit)}{numberStr(face.number)}</span>
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  col: { display: 'flex', flexDirection: 'column', gap: 1, width: '100%' },
  row: { display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,.45)', borderRadius: 2, padding: '0 2px', height: 14, fontSize: 10, lineHeight: '14px' },
  icon: { width: 12, height: 12, objectFit: 'contain' },
  name: { color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  suit: { fontWeight: 700 },
}
