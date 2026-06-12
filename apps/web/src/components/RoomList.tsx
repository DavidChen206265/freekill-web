// RoomList.tsx — renders the lobby room list from lobbyStore.

import { useState } from 'react'
import { useLobbyStore, useConnectionStore, type RoomInfo } from '../stores/index.js'
import { tr } from '../i18n/zh.js'

export function RoomList() {
  const rooms = useLobbyStore((s) => s.rooms)
  const client = useConnectionStore((s) => s.client)
  // Inline per-room password, mirroring RoomDelegate.qml passwordEdit (a TextField
  // pre-filled in the card, shown only when hasPassword && !outdated) instead of a
  // post-click window.prompt. Keyed by room id.
  const [pw, setPw] = useState<Record<number, string>>({})

  // asio Lobby::joinRoom applies the SAME password gate to enter and observe
  // (lobby.cpp:240 — `password.empty() || pw == password`). Sending "" for a
  // passworded room hits `room password error` (lobby.cpp:256), so observe sends
  // the same inline password as enter.
  const roomPw = (room: RoomInfo) => (room.hasPassword ? (pw[room.id] ?? '') : '')
  const enter = (room: RoomInfo) => {
    client?.notify('EnterRoom', [room.id, roomPw(room)])
  }
  const observe = (room: RoomInfo) => {
    client?.notify('ObserveRoom', [room.id, roomPw(room)])
  }

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
        {rooms.map((r) => {
          // RoomDelegate.qml: enterButton.enabled = !outdated; text = Enter when
          // (playerNum < capacity) else Observe (full rooms can only be observed).
          const full = r.playerCount >= r.capacity
          return (
            <tr key={r.id} style={styles.row}>
              <td style={styles.td}>{r.id}</td>
              <td style={styles.td}>{r.hasPassword ? '🔒 ' : ''}{r.name}{r.outdated ? ' ⚠️' : ''}</td>
              <td style={styles.td}>{tr(r.gameMode)}</td>
              <td style={styles.td}>{r.playerCount}/{r.capacity}</td>
              <td style={styles.td}>
                {/* inline password field (passwordEdit): only when hasPassword && !outdated */}
                {r.hasPassword && !r.outdated && (
                  <input
                    type="password"
                    placeholder="密码"
                    value={pw[r.id] ?? ''}
                    onChange={(e) => setPw((m) => ({ ...m, [r.id]: e.target.value }))}
                    style={styles.pwInput}
                  />
                )}
                {/* full room: Observe only. outdated room: both disabled (version mismatch). */}
                {!full && (
                  <button
                    style={r.outdated ? styles.btnDisabled : styles.btn}
                    disabled={r.outdated}
                    onClick={() => enter(r)}
                  >加入</button>
                )}
                <button
                  style={r.outdated ? styles.btnDisabled : styles.btnGhost}
                  disabled={r.outdated}
                  onClick={() => observe(r)}
                >旁观</button>
              </td>
            </tr>
          )
        })}
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
  pwInput: { marginRight: 6, padding: '2px 6px', width: 64, border: '1px solid #555', borderRadius: 4, background: '#1a1a1a', color: '#ddd' },
  btn: { marginRight: 6, padding: '3px 10px', border: 'none', borderRadius: 4, background: '#0e639c', color: '#fff', cursor: 'pointer' },
  btnGhost: { padding: '3px 10px', border: '1px solid #555', borderRadius: 4, background: 'transparent', color: '#ccc', cursor: 'pointer' },
  btnDisabled: { marginRight: 6, padding: '3px 10px', border: '1px solid #444', borderRadius: 4, background: '#2a2a2a', color: '#666', cursor: 'not-allowed' },
}
