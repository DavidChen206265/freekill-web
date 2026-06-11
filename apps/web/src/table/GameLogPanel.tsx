// GameLogPanel.tsx — collapsible battle-log panel (right side). Renders the VM's
// already-parsed GameLog lines (HTML markup from parseMsg: <font color><b>…).
// The HTML is produced by the local VM (trusted computation, not network input),
// but we still strip <script> and on*= handlers as defense-in-depth before
// dangerouslySetInnerHTML.

import { useState, useEffect, useRef } from 'react'
import { useLogStore } from '../stores/logStore.js'
import { useGameStore } from '../stores/gameStore.js'

function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/ on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/ on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

export function GameLogPanel() {
  const started = useGameStore((s) => s.started)
  const lines = useLogStore((s) => s.lines)
  // 战报默认折叠(2a):不挡视野,需要时点开。
  const [open, setOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [lines])

  if (!started) return null

  return (
    <div style={styles.wrap}>
      <button style={styles.toggle} onClick={() => setOpen((v) => !v)}>{open ? '战报 ▸' : '战报 ◂'}</button>
      {open && (
        <div ref={scrollRef} style={styles.panel}>
          {lines.map((l) => (
            <div key={l.id} style={styles.line} dangerouslySetInnerHTML={{ __html: sanitize(l.html) }} />
          ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'absolute', right: 8, top: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, zIndex: 70, pointerEvents: 'auto' },
  toggle: { padding: '3px 10px', borderRadius: 5, border: '1px solid #555', background: 'rgba(0,0,0,.5)', color: '#cfe', fontSize: 12, cursor: 'pointer' },
  panel: { width: 280, maxHeight: 320, overflowY: 'auto', background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '6px 8px', fontSize: 12, lineHeight: 1.5, color: '#eee' },
  line: { marginBottom: 2, wordBreak: 'break-word' },
}
