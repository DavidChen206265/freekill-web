// RoomChatPanel.tsx — IG-5 in-game chat + 送花/砸蛋. Bottom-left collapsible panel.
// Text chat sends Chat {type:2, msg} (asio broadcasts to room + observers); the VM's
// ClientBase:chat enriches it and notifyUI("Chat") → roomChatStore (handleChat in
// vmStore). Presents send "$@<Type>:<pid>" (WaitingRoom.qml givePresent) which fly as
// a glyph from sender→target. Observers can't send (mirrors QML !Config.observing).

import { useState } from 'react'
import { useRoomChatStore } from '../stores/roomChatStore.js'
import { useGameStore } from '../stores/gameStore.js'
import { useConnectionStore } from '../stores/index.js'
import { ChatText } from './ChatText.js'

const PRESENTS: { type: string; glyph: string; label: string }[] = [
  { type: 'Flower', glyph: '🌹', label: '花' },
  { type: 'Egg', glyph: '🥚', label: '蛋' },
  { type: 'GiantEgg', glyph: '🥚', label: '巨蛋' },
  { type: 'Shoe', glyph: '👟', label: '鞋' },
  { type: 'Wine', glyph: '🍷', label: '酒' },
]

export function RoomChatPanel() {
  const lines = useRoomChatStore((s) => s.lines)
  const players = useGameStore((s) => s.players)
  const selfId = useGameStore((s) => s.selfId)
  const observing = useGameStore((s) => s.observing)
  const client = useConnectionStore((s) => s.client)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [presentOpen, setPresentOpen] = useState(false)

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const msg = text.trim()
    if (!msg || observing) return
    client?.notify('Chat', { type: 2, msg })
    setText('')
  }
  const givePresent = (type: string, pid: number) => {
    if (observing) return
    client?.notify('Chat', { type: 2, msg: `$@${type}:${pid}` })
    setPresentOpen(false)
  }

  // Other seated players (present targets) — exclude self.
  const targets = Object.values(players).filter((p) => p.id !== selfId && p.id > 0)

  return (
    <div style={styles.wrap}>
      <button style={styles.toggle} onClick={() => setOpen((o) => !o)}>
        {open ? '▼ 聊天' : '▲ 聊天'}{lines.length > 0 ? ` (${lines.length})` : ''}
      </button>
      {open && (
        <div style={styles.panel}>
          <div style={styles.log}>
            {lines.length === 0 && <div style={styles.empty}>暂无消息</div>}
            {lines.map((l) => (
              <div key={l.seq} style={styles.line}>
                <span style={styles.who}>{l.userName}:</span> <span><ChatText text={l.msg} /></span>
              </div>
            ))}
          </div>
          {observing ? (
            <div style={styles.empty}>旁观中，不能发言</div>
          ) : (
            <>
              <form style={styles.inputRow} onSubmit={send}>
                <input style={styles.input} value={text} onChange={(e) => setText(e.target.value)} placeholder="发送消息…" maxLength={300} />
                <button style={styles.btn} type="submit">发送</button>
                <button style={styles.btn} type="button" onClick={() => setPresentOpen((o) => !o)} title="送花/砸蛋">🎁</button>
              </form>
              {presentOpen && (
                <div style={styles.presentMenu}>
                  {PRESENTS.map((pr) => (
                    <div key={pr.type} style={styles.presentRow}>
                      <span style={styles.presentGlyph}>{pr.glyph} {pr.label}</span>
                      <div style={styles.targetRow}>
                        {targets.length === 0 && <span style={styles.empty}>无目标</span>}
                        {targets.map((t) => (
                          <button key={t.id} style={styles.targetBtn} onClick={() => givePresent(pr.type, t.id)}>
                            {t.name || `P${t.id}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'absolute', left: 8, bottom: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, zIndex: 75, pointerEvents: 'auto' },
  toggle: { padding: '3px 10px', border: 'none', borderRadius: 6, background: 'rgba(0,0,0,.6)', color: '#eee', cursor: 'pointer', fontSize: 12 },
  panel: { width: 260, background: 'rgba(0,0,0,.6)', borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 },
  log: { maxHeight: 160, overflowY: 'auto', fontSize: 12, lineHeight: 1.5, color: '#eee', display: 'flex', flexDirection: 'column', gap: 2 },
  empty: { color: '#888', fontSize: 12 },
  line: { wordBreak: 'break-word' },
  who: { color: '#4ec9b0', fontWeight: 600 },
  inputRow: { display: 'flex', gap: 4 },
  input: { flex: 1, minWidth: 0, padding: '5px 7px', borderRadius: 6, border: '1px solid #444', background: '#1b1b1f', color: '#eee', fontSize: 12 },
  btn: { padding: '5px 9px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', cursor: 'pointer', fontSize: 12 },
  presentMenu: { display: 'flex', flexDirection: 'column', gap: 5, borderTop: '1px solid #444', paddingTop: 6 },
  presentRow: { display: 'flex', flexDirection: 'column', gap: 3 },
  presentGlyph: { fontSize: 12, color: '#E4D5A0' },
  targetRow: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  targetBtn: { padding: '3px 7px', border: '1px solid #555', borderRadius: 5, background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: 11 },
}
