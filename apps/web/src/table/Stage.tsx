// Stage.tsx — the fixed-stage viewport. A 1200×540 logical canvas centered and
// scaled to fit the window (plan §5.1): scale = min(vw/1200, vh/540). All table
// children use absolute logical coordinates inside `stage`.

import { useEffect, useState, type ReactNode } from 'react'

export const STAGE_W = 1200
export const STAGE_H = 540

export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const recompute = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H))
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [])

  return (
    <div style={styles.viewport}>
      <div style={{ ...styles.stage, transform: `scale(${scale})` }}>{children}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  // W1-1 2e: game background image (FreeKill image/gamebg.jpg) behind the table,
  // with the dark-green fallback color showing through letterbox bars / on load fail.
  viewport: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', overflow: 'hidden', background: '#0d3b1e' },
  stage: { position: 'relative', width: STAGE_W, height: STAGE_H, transformOrigin: 'center center', backgroundColor: '#14532d', backgroundImage: 'url(/fk/image/gamebg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: '0 0 0 2px #0a2e16' },
}
