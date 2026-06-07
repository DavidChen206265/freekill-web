// JudgeArea.tsx — delayed-trick (judge) cards as small icons in a horizontal row,
// mirroring DelayedTrickArea.qml: a Row (spacing -4) that GROUPS cards by name —
// same-name tricks merge into ONE icon carrying a count badge (bottom-right,
// shown only when count > 1). Icon = skin.delayedTrickPic(name, ext) where ext is
// the CARD's extension (package). Item size 47×55 ×0.6 = 28×33.

import { useCardFaceStore } from '../stores/cardFaceStore.js'
import { delayedTrickPic, delayedTrickSealedPic } from './skin.js'
import { tr } from '../i18n/zh.js'

export function JudgeArea({ cids, sealed = false }: { cids: number[]; sealed?: boolean }) {
  const faces = useCardFaceStore((s) => s.faces)
  if (!cids.length && !sealed) return null

  // Group by display name (virt_name||name), preserving first-seen order — the
  // DelayedTrickArea.qml `cids[cardName]` bucketing. Each group = one icon + count.
  const order: string[] = []
  const groups = new Map<string, { name: string; ext?: string; count: number }>()
  for (const cid of cids) {
    const face = faces[cid]
    const name = face?.virt_name || face?.name || String(cid)
    const g = groups.get(name)
    if (g) g.count++
    else { groups.set(name, { name, ext: face?.extension, count: 1 }); order.push(name) }
  }

  return (
    <div style={styles.row}>
      {/* JudgeSlot sealed marker (DelayedTrickArea.qml sealed image, x:-6 y:8) */}
      {sealed && <img src={delayedTrickSealedPic()} alt="封" style={styles.sealed} draggable={false} onError={hideImg} />}
      {order.map((key) => {
        const g = groups.get(key)!
        const icon = g.name ? delayedTrickPic(g.name, g.ext) : ''
        return (
          <div key={key} style={styles.item} title={tr(g.name)}>
            {icon
              ? <img src={icon} alt={tr(g.name)} style={styles.img} draggable={false} onError={hideImg} />
              : <span style={styles.fallback}>{tr(g.name)}</span>}
            {/* count badge, bottom-right, only when > 1 (DelayedTrickArea.qml len>1) */}
            {g.count > 1 && <span style={styles.count}>{g.count}</span>}
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
  row: { display: 'flex', alignItems: 'flex-end' },
  item: { position: 'relative', width: 28, height: 33, marginLeft: -4 },
  img: { width: 28, height: 33, objectFit: 'contain' },
  count: { position: 'absolute', right: 1, bottom: 1, fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 0 2px #000, 0 0 2px #000' },
  fallback: { fontSize: 9, color: '#fff', background: 'rgba(0,0,0,.5)', borderRadius: 2, padding: '0 2px' },
  sealed: { width: 18, height: 21, objectFit: 'contain', marginRight: -2 },
}
