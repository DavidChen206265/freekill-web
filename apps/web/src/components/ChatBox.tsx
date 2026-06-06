// ChatBox.tsx — lobby chat. Outgoing chat is {type:1, msg} (asio RoomBase::chat).

import { useState } from 'react'
import { useLobbyStore, useConnectionStore } from '../stores/index.js'

export function ChatBox() {
  const chat = useLobbyStore((s) => s.chat)
  const client = useConnectionStore((s) => s.client)
  const [text, setText] = useState('')

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const msg = text.trim()
    if (!msg) return
    client?.notify('Chat', { type: 1, msg })
    setText('')
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.log}>
        {chat.length === 0 && <p style={styles.empty}>大厅聊天</p>}
        {chat.map((line, i) => (
          <div key={i} style={styles.line}>
            {line.who && <span style={styles.who}>{line.who}: </span>}
            <span>{line.text}</span>
          </div>
        ))}
      </div>
      <form style={styles.inputRow} onSubmit={send}>
        <input style={styles.input} value={text} onChange={(e) => setText(e.target.value)} placeholder="发送消息…" />
        <button style={styles.btn} type="submit">发送</button>
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  log: { flex: 1, overflowY: 'auto', padding: 8, fontSize: 13, background: '#1b1b1f', borderRadius: 6 },
  empty: { color: '#666', margin: 0 },
  line: { padding: '2px 0', wordBreak: 'break-word' },
  who: { color: '#4ec9b0', fontWeight: 600 },
  inputRow: { display: 'flex', gap: 6, marginTop: 6 },
  input: { flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #444', background: '#1b1b1f', color: '#eee' },
  btn: { padding: '6px 14px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', cursor: 'pointer' },
}
