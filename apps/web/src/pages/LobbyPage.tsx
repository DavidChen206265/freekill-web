// LobbyPage.tsx — lobby shell: header (online count, refresh, create, logout),
// room list, chat. Refreshes the room list on mount.

import { useEffect, useState } from 'react'
import { useConnectionStore, useLobbyStore, useAuthStore } from '../stores/index.js'
import { RoomList } from '../components/RoomList.js'
import { ChatBox } from '../components/ChatBox.js'
import { CreateRoomDialog } from '../components/CreateRoomDialog.js'
import { VmDebugPanel } from '../components/VmDebugPanel.js'

export function LobbyPage() {
  const { client, disconnect } = useConnectionStore()
  const { online, total, enteredRoomId } = useLobbyStore()
  const username = useAuthStore((s) => s.username)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { client?.notify('RefreshRoomList', '') }, [client])

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <strong style={{ fontSize: 16 }}>FreeKill 大厅</strong>
        <span style={styles.meta}>玩家:{username}</span>
        <span style={styles.meta}>在线 {online} / 总 {total}</span>
        <div style={{ flex: 1 }} />
        <button style={styles.btn} onClick={() => client?.notify('RefreshRoomList', '')}>刷新</button>
        <button style={styles.btn} onClick={() => setShowCreate(true)}>建房</button>
        <button style={styles.ghost} onClick={disconnect}>退出</button>
      </header>

      {enteredRoomId !== undefined && (
        <div style={styles.banner}>已进入房间 · 客户端 VM 已接管(牌桌 UI 在后续 M2 切片实现)。</div>
      )}

      <div style={styles.body}>
        {enteredRoomId !== undefined ? (
          <main style={styles.main}><VmDebugPanel /></main>
        ) : (
          <main style={styles.main}><RoomList /></main>
        )}
        <aside style={styles.aside}><ChatBox /></aside>
      </div>

      {showCreate && <CreateRoomDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#1b1b1f', color: '#eee', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', background: '#26262b', borderBottom: '1px solid #333' },
  meta: { fontSize: 13, color: '#aaa' },
  btn: { padding: '6px 14px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', cursor: 'pointer' },
  ghost: { padding: '6px 14px', border: '1px solid #555', borderRadius: 6, background: 'transparent', color: '#ccc', cursor: 'pointer' },
  banner: { padding: '8px 16px', background: '#2d7d2d', color: '#fff', fontSize: 13 },
  body: { flex: 1, display: 'flex', minHeight: 0 },
  main: { flex: 1, overflowY: 'auto', padding: 12 },
  aside: { width: 300, borderLeft: '1px solid #333', padding: 12, display: 'flex', flexDirection: 'column' },
}
