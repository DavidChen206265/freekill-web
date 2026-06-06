// CreateRoomDialog.tsx — create a room. Sends CreateRoom:
//   [name, capacity, timeout, settings]   (asio Lobby::createRoom)
// settings mirrors the QML client's object (gameMode/roomName/password/disabled*).

import { useState } from 'react'
import { useConnectionStore } from '../stores/index.js'

export function CreateRoomDialog({ onClose }: { onClose: () => void }) {
  const client = useConnectionStore((s) => s.client)
  const [name, setName] = useState('Web测试房')
  const [capacity, setCapacity] = useState(2)
  const [gameMode, setGameMode] = useState('aaa_role_mode')
  const [password, setPassword] = useState('')

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    const settings = {
      gameMode,
      roomName: name,
      password,
      disabledPack: [] as string[],
      disabledGenerals: [] as string[],
    }
    client?.notify('CreateRoom', [name, capacity, 90, settings])
    onClose()
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <form style={styles.card} onClick={(e) => e.stopPropagation()} onSubmit={create}>
        <h2 style={styles.title}>创建房间</h2>
        <label style={styles.label}>房名
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={styles.label}>人数
          <input style={styles.input} type="number" min={2} max={8} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
        </label>
        <label style={styles.label}>模式
          <select style={styles.input} value={gameMode} onChange={(e) => setGameMode(e.target.value)}>
            <option value="aaa_role_mode">身份模式</option>
          </select>
        </label>
        <label style={styles.label}>密码(可选)
          <input style={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div style={styles.actions}>
          <button style={styles.ghost} type="button" onClick={onClose}>取消</button>
          <button style={styles.primary} type="submit">创建</button>
        </div>
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 70 },
  card: { display: 'flex', flexDirection: 'column', gap: 10, width: 300, padding: 24, background: '#26262b', borderRadius: 10, color: '#eee' },
  title: { margin: 0, fontSize: 18 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#bbb' },
  input: { padding: '7px 9px', borderRadius: 6, border: '1px solid #444', background: '#1b1b1f', color: '#eee' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  ghost: { padding: '7px 14px', border: '1px solid #555', borderRadius: 6, background: 'transparent', color: '#ccc', cursor: 'pointer' },
  primary: { padding: '7px 14px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', cursor: 'pointer' },
}
