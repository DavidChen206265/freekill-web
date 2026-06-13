// Stage.tsx — the fixed-stage viewport. A 1200×540 logical canvas centered and
// scaled to fit the window (plan §5.1): scale = min(vw/1200, vh/540). All table
// children use absolute logical coordinates inside `stage`.

import { useEffect, useState, type ReactNode } from 'react'
import { readStageViewport, STAGE_H, STAGE_W, type StageViewportState } from './stageViewport.js'

export { STAGE_H, STAGE_W }

const STABILIZE_MS = 120

export function Stage({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<StageViewportState>(() => {
    if (typeof window === 'undefined') return { mobilePwa: false, width: STAGE_W, height: STAGE_H, scale: 1 }
    return readStageViewport()
  })

  useEffect(() => {
    let timer: number | undefined
    const recompute = () => {
      setViewport(readStageViewport())
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setViewport(readStageViewport()), STABILIZE_MS)
    }
    recompute()
    window.addEventListener('resize', recompute)
    window.addEventListener('orientationchange', recompute)
    window.visualViewport?.addEventListener('resize', recompute)
    window.visualViewport?.addEventListener('scroll', recompute)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', recompute)
      window.removeEventListener('orientationchange', recompute)
      window.visualViewport?.removeEventListener('resize', recompute)
      window.visualViewport?.removeEventListener('scroll', recompute)
    }
  }, [])

  return (
    <div style={viewport.mobilePwa ? mobileViewportStyle(viewport) : styles.viewport}>
      <div style={{ ...styles.stage, transform: `scale(${viewport.scale})` }}>{children}</div>
    </div>
  )
}

function mobileViewportStyle(viewport: StageViewportState): React.CSSProperties {
  return {
    ...styles.viewport,
    width: viewport.width,
    height: viewport.height,
    inset: 'auto',
    left: 0,
    top: 0,
  }
}

const styles: Record<string, React.CSSProperties> = {
  // W1-1 2e: game background image (FreeKill image/gamebg.jpg) behind the table,
  // with the dark-green fallback color showing through letterbox bars / on load fail.
  viewport: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', overflow: 'hidden', background: '#0d3b1e' },
  stage: { position: 'relative', width: STAGE_W, height: STAGE_H, transformOrigin: 'center center', backgroundColor: '#14532d', backgroundImage: 'url(/fk/image/gamebg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: '0 0 0 2px #0a2e16', willChange: 'transform' },
}
