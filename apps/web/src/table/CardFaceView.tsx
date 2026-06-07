// CardFaceView.tsx — renders a single card: full card art (cardPic) with suit +
// number image overlays in the top-left, mirroring CardItem.qml/PokerCard.qml.
// Falls back to a drawn text face (suit symbol + number + name) when the card art
// or a face isn't available, and to the card back when face-down. The art scales
// with cardScale = width/93 (QML base card width).

import { useState } from 'react'
import { useCardFaceStore, suitSymbol, isRedSuit, numberStr } from '../stores/cardFaceStore.js'
import { cardPic, suitPic, numberPic, cardBackPic } from './skin.js'
import { tr } from '../i18n/zh.js'

const CARD_BASE_W = 93 // PokerCard base width (for overlay scaling)

export function CardFaceView({ cid, faceUp, width, height }: {
  cid: number
  faceUp: boolean
  width: number
  height: number
}) {
  const face = useCardFaceStore((s) => s.faces[cid])
  const [artFailed, setArtFailed] = useState(false)
  const [backFailed, setBackFailed] = useState(false)

  if (!faceUp) {
    const back = cardBackPic()
    if (back && !backFailed) {
      return <img src={back} alt="" style={{ ...styles.img, width, height }} draggable={false} onError={() => setBackFailed(true)} />
    }
    return <div style={{ ...styles.back, width, height }}>FK</div>
  }
  if (!face) {
    return <div style={{ ...styles.face, width, height }}><span style={styles.muted}>{cid}</span></div>
  }

  const scale = width / CARD_BASE_W
  const art = cardPic(face.name, face.extension)
  const sImg = suitPic(face.suit)
  const nImg = numberPic(face.number, face.color)

  // Real card art + image overlays (suit top-left, number above it).
  if (art && !artFailed) {
    return (
      <div style={{ ...styles.wrap, width, height }}>
        <img src={art} alt="" style={{ ...styles.img, width, height }} draggable={false} onError={() => setArtFailed(true)} />
        {nImg && <img src={nImg} alt="" style={{ position: 'absolute', left: 0, top: 0, width: 27 * scale, height: 28 * scale }} draggable={false} />}
        {sImg && <img src={sImg} alt="" style={{ position: 'absolute', left: 3 * scale, top: 19 * scale, width: 21 * scale, height: 17 * scale }} draggable={false} />}
      </div>
    )
  }

  // Fallback: drawn text face.
  const red = isRedSuit(face.suit)
  return (
    <div style={{ ...styles.face, width, height }}>
      <div style={{ ...styles.corner, color: red ? '#c0392b' : '#222' }}>
        <span>{suitSymbol(face.suit)}</span>
        <span style={styles.num}>{numberStr(face.number)}</span>
      </div>
      <div style={styles.name}>{tr(face.virt_name || face.name)}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'relative', borderRadius: 6, overflow: 'hidden' },
  img: { borderRadius: 6, objectFit: 'cover', display: 'block' },
  face: { background: '#f5f0e1', color: '#222', borderRadius: 6, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  back: { background: '#3b5b8c', color: '#dde', borderRadius: 6, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 },
  corner: { position: 'absolute', top: 2, left: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, fontSize: 14, fontWeight: 700 },
  num: { fontSize: 12 },
  name: { fontSize: 13, fontWeight: 700, textAlign: 'center', padding: '0 2px', writingMode: 'vertical-rl', maxHeight: '70%' },
  muted: { color: '#999', fontSize: 12 },
}
