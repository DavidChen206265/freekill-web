// WaitingRoom.tsx — pre-game lobby for a room. Mirrors WaitingRoom.qml:
//   - shows seats (players + sealed empty slots up to capacity)
//   - Ready/Cancel button (non-owner), Add Robot (owner & !full),
//     Start Game (owner & full, enabled when all non-owners ready)
// Commands go straight to the gateway (Cpp.notifyServer equivalent), not the VM.
// Derived state comes from gameStore (players carry ready/owner/seat; capacity).

import { useGameStore } from '../stores/gameStore.js'
import { useConnectionStore } from '../stores/index.js'
import { useServerManifestStore } from '../stores/serverManifestStore.js'
import { canKickPlayer, playerStateLabel } from './roomActions.js'
import { deriveWaitingState } from './waitingState.js'

export function WaitingRoom() {
  const players = useGameStore((s) => s.players)
  const selfId = useGameStore((s) => s.selfId)
  const capacity = useGameStore((s) => s.capacity)
  const client = useConnectionStore((s) => s.client)
  // Server-advertised features (W0-2). undefined until a manifest arrives → keep
  // current behavior; once received, AddRobot is gated on webFeatures.
  const received = useServerManifestStore((s) => s.received)
  const webFeatures = useServerManifestStore((s) => s.webFeatures)

  const list = Object.values(players)
  const { playerNum, isFull, showReady, showAddRobot, showStart, startEnabled, isReady } =
    deriveWaitingState(players, selfId, capacity, received ? webFeatures : undefined)
  const selfIsOwner = selfId !== undefined ? !!players[selfId]?.owner : false

  const notify = (cmd: string) => () => client?.notify(cmd, '')
  const kickPlayer = (pid: number) => {
    if (!window.confirm('确定将该玩家移出房间？')) return
    client?.notify('KickPlayer', pid)
  }

  // Seats: real players first (by index), then sealed empty slots up to capacity.
  const seats: ({ id: number } | null)[] = []
  const ordered = [...list].sort((a, b) => a.index - b.index)
  for (let i = 0; i < Math.max(capacity, playerNum); i++) {
    seats.push(ordered[i] ? { id: ordered[i]!.id } : null)
  }

  return (
    <div style={styles.wrap}>
      <h2 style={styles.title}>等待房间 · {playerNum}/{capacity || '?'}</h2>
      <div style={styles.seats}>
        {seats.map((seat, i) => {
          const p = seat ? players[seat.id] : undefined
          return (
            <div key={i} style={{ ...styles.seat, ...(p ? {} : styles.empty) }}>
              {p ? (
                <>
                  <div style={styles.avatar}>{p.general || p.avatar || `P${p.id}`}</div>
                  <div style={styles.name}>
                    {p.name || `P${p.id}`}
                    {p.owner && <span style={styles.ownerTag}>房主</span>}
                  </div>
                  <div style={{ ...styles.readyTag, color: p.ready ? '#2ecc71' : '#888' }}>
                    {p.owner ? '—' : p.ready ? '已准备' : '未准备'}
                  </div>
                  {p.state !== undefined && p.state !== 1 && playerStateLabel(p.state) && <div style={styles.stateTag}>{playerStateLabel(p.state)}</div>}
                  {canKickPlayer(selfId, p, selfIsOwner) && (
                    <button style={styles.kickBtn} onClick={() => kickPlayer(p.id)}>踢出</button>
                  )}
                  <WinRatePanel data={p.gameData} />
                </>
              ) : (
                <span style={styles.emptyText}>空位</span>
              )}
            </div>
          )
        })}
      </div>

      <div style={styles.actions}>
        {showReady && (
          <button style={styles.btn} onClick={notify('Ready')}>
            {isReady ? '取消准备' : '准备'}
          </button>
        )}
        {showAddRobot && (
          <button style={styles.btn} onClick={notify('AddRobot')}>加入机器人</button>
        )}
        {showStart && (
          <button
            style={{ ...styles.btn, ...(startEnabled ? {} : styles.disabled) }}
            disabled={!startEnabled}
            onClick={notify('StartGame')}
          >开始游戏</button>
        )}
        <button style={styles.ghost} onClick={notify('QuitRoom')}>离开房间</button>
      </div>
    </div>
  )
}

// Per-seat win-rate panel (WaitingPhoto.qml:43-74 winRateRect). Shows 时长 (min<100
// else h), then either "新手" (totalGame===0) or Win%/Run%/Total. runRate>0.2 → red text.
function WinRatePanel({ data }: { data?: { total: number; win: number; run: number; totalTime: number } }) {
  if (!data) return null
  const { total, win, run, totalTime } = data
  const m = Math.floor(totalTime / 60)
  const timeStr = m < 100 ? `${m} min` : `${(totalTime / 3600).toFixed(2)} h`
  const highRun = total > 0 && run / total > 0.2
  return (
    <div style={{ ...styles.winRate, color: highRun ? '#e74c3c' : '#fff' }}>
      <div>时长: {timeStr}</div>
      {total === 0 ? (
        <div>新手</div>
      ) : (
        <>
          <div>胜率 {((win / total) * 100).toFixed(1)}%</div>
          <div>逃率 {((run / total) * 100).toFixed(1)}%</div>
          <div>总场 {total}</div>
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, background: '#14532d', color: '#eee', fontFamily: 'system-ui' },
  title: { margin: 0, fontSize: 20 },
  seats: { display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', maxWidth: 900 },
  seat: { width: 120, height: 188, background: '#26262b', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px solid #333' },
  empty: { background: 'transparent', border: '1px dashed #3a5', opacity: 0.5 },
  emptyText: { color: '#6a8' },
  avatar: { width: 70, height: 70, borderRadius: 6, background: '#3b5b8c', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, textAlign: 'center', padding: 4 },
  name: { fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 },
  ownerTag: { fontSize: 10, background: '#d4af37', color: '#222', borderRadius: 3, padding: '0 4px' },
  readyTag: { fontSize: 12 },
  stateTag: { fontSize: 10, color: '#cfd6df', lineHeight: 1 },
  kickBtn: { padding: '2px 8px', border: '1px solid #855', borderRadius: 4, background: '#5c2424', color: '#fff', cursor: 'pointer', fontSize: 11 },
  winRate: { fontSize: 10, lineHeight: 1.25, textAlign: 'center', background: '#CC3C3229', border: '1px solid rgba(255,255,255,0.6)', borderRadius: 6, padding: '2px 6px', minWidth: 96 },
  actions: { display: 'flex', gap: 12 },
  btn: { padding: '10px 28px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', fontSize: 16, cursor: 'pointer' },
  disabled: { background: '#555', color: '#999', cursor: 'not-allowed' },
  ghost: { padding: '10px 20px', border: '1px solid #555', borderRadius: 6, background: 'transparent', color: '#ccc', cursor: 'pointer' },
}
