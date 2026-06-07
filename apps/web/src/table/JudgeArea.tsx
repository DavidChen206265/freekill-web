// JudgeArea.tsx — delayed-trick (judge) cards shown as small icons in a row inside
// the Photo, mirroring DelayedTrickArea.qml. Icon from skin.delayedTrickPic.

import { useCardFaceStore } from '../stores/cardFaceStore.js'
import { delayedTrickPic } from './skin.js'
import { tr } from '../i18n/zh.js'

export function JudgeArea({ cids, ext }: { cids: number[]; ext: (name: string) => string | undefined }) {
  const faces = useCardFaceStore((s) => s.faces)
  if (!cids.length) return null
  return (
    <div style={styles.row}>
      {cids.map((cid) => {
        const face = faces[cid]
        const name = face?.virt_name || face?.name || ''
        const icon = name ? delayedTrickPic(name, ext(name)) : ''
        return (
          <div key={cid} style={styles.item} title={tr(name)}>
            {icon
              ? <img src={icon} alt={tr(name)} style={styles.img} draggable={false} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              : <span style={styles.fallback}>{tr(name) || cid}</span>}
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  row: { display: 'flex', gap: 0, alignItems: 'center' },
  item: { width: 22, height: 28, marginLeft: -4 },
  img: { width: 22, height: 28, objectFit: 'contain' },
  fallback: { fontSize: 9, color: '#fff', background: 'rgba(0,0,0,.5)', borderRadius: 2, padding: '0 2px' },
}
