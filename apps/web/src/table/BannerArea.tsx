// BannerArea.tsx — global roomScene.banner MarkArea (Room.qml x:12 y:12).
// SetBanner drives this area; layout is a compact web port of MarkArea.qml.

import { useBannerStore } from '../stores/bannerStore.js'
import { useMemo } from 'react'

export function BannerArea() {
  const markMap = useBannerStore((s) => s.marks)
  const marks = useMemo(() => Object.values(markMap), [markMap])
  if (marks.length === 0) return null

  return (
    <div style={styles.wrap}>
      {marks.map((m) => (
        <span key={m.mark} style={styles.mark}>{m.value ? `${m.name} ${m.value}` : m.name}</span>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 172,
    minHeight: 16,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 2,
    padding: 2,
    background: 'rgba(131,138,234,.73)',
    border: '1px solid rgba(255,255,255,.85)',
    borderRadius: 4,
    zIndex: 8,
    pointerEvents: 'none',
  },
  mark: {
    minWidth: 80,
    color: '#fff',
    fontSize: 16,
    lineHeight: '16px',
    textShadow: '0 0 2px #000, 0 0 2px #000',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  },
}
