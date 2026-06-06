// RoomList.tsx — renders the lobby room list from lobbyStore.

import { useLobbyStore, useConnectionStore, type RoomInfo } from '../stores/index.js'
import { tr } from '../i18n/zh.js'

export function RoomList() {
  const rooms = useLobbyStore((s) => s.rooms)
  const client = useConnectionStore((s) => s.client)

  const enter = (room: RoomInfo) => {
    let password = ''
    if (room.hasPassword) password = window.prompt('房间密码:') ?? ''
    client?.notify('EnterRoom', [room.id, password])
  }
  const observe = (room: RoomInfo) => client?.notify('ObserveRoom', [room.id, ''])

  if (rooms.length === 0) {
    return <p style={{ color: '#777', padding: 12 }}>暂无房间。点「刷新」或「建房」。</p>
  }

  return (
    <table style={styles.table}>
      <thead>
        <tr style={styles.headRow}>
          <th style={styles.th}>#</th>
          <th style={styles.th}>房名</th>
          <th style={styles.th}>模式</th>
          <th style={styles.th}>人数</th>
          <th style={styles.th}></th>
        </tr>
      </thead>
      <tbody>
        {rooms.map((r) => (
          <tr key={r.id} style={styles.row}>
            <td style={styles.td}>{r.id}</td>
            <td style={styles.td}>{r.hasPassword ? '🔒 ' : ''}{r.name}{r.outdated ? ' ⚠️' : ''}</td>
            <td style={styles.td}>{tr(r.gameMode)}</td>
            <td style={styles.td}>{r.playerCount}/{r.capacity}</td>
            <td style={styles.td}>
              <button style={styles.btn} onClick={() => enter(r)}>加入</button>
              <button style={styles.btnGhost} onClick={() => observe(r)}>旁观</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const styles: Record<string, React.CSSProperties> = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  headRow: { color: '#888', textAlign: 'left' },
  th: { padding: '6px 8px', borderBottom: '1px solid #333', fontWeight: 600 },
  row: { borderBottom: '1px solid #2a2a2a' },
  td: { padding: '6px 8px' },
  btn: { marginRight: 6, padding: '3px 10px', border: 'none', borderRadius: 4, background: '#0e639c', color: '#fff', cursor: 'pointer' },
  btnGhost: { padding: '3px 10px', border: '1px solid #555', borderRadius: 4, background: 'transparent', color: '#ccc', cursor: 'pointer' },
}
