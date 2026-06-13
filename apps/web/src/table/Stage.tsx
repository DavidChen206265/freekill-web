// Stage.tsx — the fixed-stage viewport. A 1200×540 logical canvas centered and
// scaled to fit the actual container. The scale is always contain-style:
// min(containerW/1200, containerH/540), so one axis fills and the other may show
// the green table background. All table children use absolute logical coordinates.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { computeStageLayout, readStageViewport, STAGE_H, STAGE_W, type StageLayoutState } from './stageViewport.js'

export { STAGE_H, STAGE_W }

const STABILIZE_MS = 120

function initialLayout(): StageLayoutState {
  if (typeof window === 'undefined') return computeStageLayout(STAGE_W, STAGE_H)
  const viewport = readStageViewport()
  return computeStageLayout(viewport.width, viewport.height)
}

export function Stage({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState<StageLayoutState>(() => initialLayout())

  useEffect(() => {
    let timer: number | undefined
    let observer: ResizeObserver | undefined

    const measure = () => {
      const rect = viewportRef.current?.getBoundingClientRect()
      if (rect && rect.width > 0 && rect.height > 0) {
        setLayout(computeStageLayout(rect.width, rect.height))
        return
      }
      const viewport = readStageViewport()
      setLayout(computeStageLayout(viewport.width, viewport.height))
    }

    const recompute = () => {
      measure()
      window.clearTimeout(timer)
      timer = window.setTimeout(measure, STABILIZE_MS)
    }

    if (typeof ResizeObserver !== 'undefined' && viewportRef.current) {
      observer = new ResizeObserver(recompute)
      observer.observe(viewportRef.current)
    }
    recompute()
    window.addEventListener('resize', recompute)
    window.addEventListener('orientationchange', recompute)
    window.visualViewport?.addEventListener('resize', recompute)
    window.visualViewport?.addEventListener('scroll', recompute)
    return () => {
      observer?.disconnect()
      window.clearTimeout(timer)
      window.removeEventListener('resize', recompute)
      window.removeEventListener('orientationchange', recompute)
      window.visualViewport?.removeEventListener('resize', recompute)
      window.visualViewport?.removeEventListener('scroll', recompute)
    }
  }, [])

  return (
    <div ref={viewportRef} style={styles.viewport}>
      <div
        style={{
          ...styles.stage,
          left: layout.left,
          top: layout.top,
          transform: `scale(${layout.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  // W1-1 2e: game background image (FreeKill image/gamebg.jpg) behind the table,
  // with the dark-green fallback color showing through letterbox bars / on load fail.
  viewport: { position: 'absolute', inset: 0, overflow: 'hidden', background: '#0d3b1e' },
  stage: { position: 'absolute', width: STAGE_W, height: STAGE_H, transformOrigin: 'top left', backgroundColor: '#14532d', backgroundImage: 'url(/fk/image/gamebg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: '0 0 0 2px #0a2e16', willChange: 'transform' },
}
