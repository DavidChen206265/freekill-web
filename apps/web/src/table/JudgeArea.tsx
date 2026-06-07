// JudgeArea.tsx — delayed-trick (judge) cards as small icons in a row inside the
// Photo, mirroring DelayedTrickArea.qml. Icon = skin.delayedTrickPic(name, ext)
// where ext is the CARD's extension (package). Size 28×33 (47×55 ×0.6), spacing
// -4. Same-name tricks would show a count, but each judge card is its own item.

import { useCardFaceStore } from '../stores/cardFaceStore.js'
import { delayedTrickPic } from './skin.js'
import { tr } from '../i18n/zh.js'

export function JudgeArea({ cids }: { cids: number[] }) {
  const faces = useCardFaceStore((s) => s.faces)
  if (!cids.length) return null
  return (
    <div style={styles.row}>
      {cids.map((cid) => {
        const face = faces[cid]
        const name = face?.virt_name || face?.name || ''
        const icon = name ? delayedTrickPic(name, face?.extension) : ''
        return (
          <div key={cid} style={styles.item} title={tr(name)}>
            {icon
              ? <img src={icon} alt={tr(name)} style={styles.img} draggable={false} onError={hideImg} />
              : <span style={styles.fallback}>{tr(name) || cid}</span>}
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
  row: { display: 'flex', alignItems: 'center' },
  item: { width: 28, height: 33, marginLeft: -4 },
  img: { width: 28, height: 33, objectFit: 'contain' },
  fallback: { fontSize: 9, color: '#fff', background: 'rgba(0,0,0,.5)', borderRadius: 2, padding: '0 2px' },
}
