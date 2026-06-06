// GameOverModal.tsx — shown when the game ends. winner is a '+'-joined role
// string ('' = draw); self wins if its role is in it (GameOverBox.qml
// victoryResult). Offers leaving the room (back to lobby).

import { useGameStore } from '../stores/gameStore.js'
import { useConnectionStore } from '../stores/index.js'

export function GameOverModal() {
  const winner = useGameStore((s) => s.winner)
  const selfId = useGameStore((s) => s.selfId)
  const players = useGameStore((s) => s.players)
  const client = useConnectionStore((s) => s.client)

  if (winner === undefined) return null

  const selfRole = selfId !== undefined ? players[selfId]?.role : undefined
  const result = winner === '' ? 'draw' : (selfRole && winner.split('+').includes(selfRole) ? 'win' : 'lose')
  const text = result === 'win' ? '胜利' : result === 'lose' ? '失败' : '平局'
  const color = result === 'win' ? '#2ecc71' : result === 'lose' ? '#e74c3c' : '#bbb'

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <div style={{ ...styles.title, color }}>{text}</div>
        <button style={styles.btn} onClick={() => client?.notify('QuitRoom', '')}>返回大厅</button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', zIndex: 120, pointerEvents: 'auto' },
  modal: { background: '#26262b', borderRadius: 12, padding: '32px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 },
  title: { fontSize: 40, fontWeight: 800, letterSpacing: 4 },
  btn: { padding: '10px 32px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', fontSize: 16, cursor: 'pointer' },
}
