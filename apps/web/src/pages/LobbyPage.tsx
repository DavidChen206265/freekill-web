// LobbyPage.tsx — lobby shell: header (online count, refresh, create, logout),
// room list, chat. Refreshes the room list on mount.

import { useEffect, useState } from 'react'
import { useConnectionStore, useLobbyStore, useAuthStore } from '../stores/index.js'
import { useGameStore } from '../stores/gameStore.js'
import { RoomList } from '../components/RoomList.js'
import { ChatBox } from '../components/ChatBox.js'
import { CreateRoomDialog } from '../components/CreateRoomDialog.js'
import { VmDebugPanel } from '../components/VmDebugPanel.js'
import { RoomScene } from '../table/RoomScene.js'
import { WaitingRoom } from '../table/WaitingRoom.js'

export function LobbyPage() {
  const { client, disconnect } = useConnectionStore()
  const { online, total, enteredRoomId } = useLobbyStore()
  const username = useAuthStore((s) => s.username)
  const started = useGameStore((s) => s.started)
  const [showCreate, setShowCreate] = useState(false)
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => { client?.notify('RefreshRoomList', '') }, [client])

  // In-room: waiting room until the game starts, then the fixed-stage table.
  if (enteredRoomId !== undefined) {
    return (
      <div style={styles.roomWrap}>
        {started ? <RoomScene /> : <WaitingRoom />}
        <div style={styles.roomBar}>
          <span style={styles.meta}>房间 · {username}</span>
          <button style={styles.btn} onClick={() => setShowDebug((v) => !v)}>{showDebug ? '隐藏' : 'VM 调试'}</button>
          <button style={styles.ghost} onClick={() => client?.notify('QuitRoom', '')}>离开</button>
        </div>
        {showDebug && <div style={styles.debugOverlay}><VmDebugPanel /></div>}
      </div>
    )
  }

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

      <div style={styles.body}>
        <main style={styles.main}><RoomList /></main>
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
  roomWrap: { position: 'fixed', inset: 0, background: '#0d3b1e' },
  roomBar: { position: 'absolute', top: 8, right: 8, display: 'flex', gap: 8, alignItems: 'center', zIndex: 80, background: 'rgba(0,0,0,.45)', padding: '6px 10px', borderRadius: 8 },
  debugOverlay: { position: 'absolute', left: 8, top: 8, width: 460, maxHeight: '90vh', overflowY: 'auto', zIndex: 80, boxShadow: '0 4px 24px rgba(0,0,0,.5)' },
}
