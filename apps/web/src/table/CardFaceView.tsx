// CardFaceView.tsx — renders a single card's face (suit symbol + number + name)
// or its back. Pure presentational; reads the face cache + VM translations.
// Real card art (images) comes in slice 6; this is the high-fidelity text face.

import { useCardFaceStore, suitSymbol, isRedSuit, numberStr } from '../stores/cardFaceStore.js'
import { tr } from '../i18n/zh.js'

export function CardFaceView({ cid, faceUp, width, height }: {
  cid: number
  faceUp: boolean
  width: number
  height: number
}) {
  const face = useCardFaceStore((s) => s.faces[cid])

  if (!faceUp) {
    return <div style={{ ...styles.back, width, height }}>FK</div>
  }
  if (!face) {
    // Face not yet cached — show the id as a fallback (transient).
    return <div style={{ ...styles.face, width, height }}><span style={styles.muted}>{cid}</span></div>
  }
  const red = isRedSuit(face.suit)
  const sym = suitSymbol(face.suit)
  const num = numberStr(face.number)
  const name = tr(face.virt_name || face.name)
  return (
    <div style={{ ...styles.face, width, height }}>
      <div style={{ ...styles.corner, color: red ? '#c0392b' : '#222' }}>
        <span>{sym}</span>
        <span style={styles.num}>{num}</span>
      </div>
      <div style={styles.name}>{name}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  face: { background: '#f5f0e1', color: '#222', borderRadius: 6, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  back: { background: '#3b5b8c', color: '#dde', borderRadius: 6, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 },
  corner: { position: 'absolute', top: 2, left: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, fontSize: 14, fontWeight: 700 },
  num: { fontSize: 12 },
  name: { fontSize: 13, fontWeight: 700, textAlign: 'center', padding: '0 2px', writingMode: 'vertical-rl', maxHeight: '70%' },
  muted: { color: '#999', fontSize: 12 },
}
