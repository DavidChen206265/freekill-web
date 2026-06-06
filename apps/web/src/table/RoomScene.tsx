// RoomScene.tsx — places all player Photos on the fixed stage, seated relative to
// self. Subscribes to gameStore. The table center / cards / animation come in the
// next M2 slice (R-ANIM).

import { Stage } from './Stage.js'
import { Photo } from './Photo.js'
import { useGameStore } from '../stores/gameStore.js'
import { toRelativeSeat } from './seatLayout.js'

export function RoomScene() {
  const players = useGameStore((s) => s.players)
  const seatOrder = useGameStore((s) => s.seatOrder)
  const selfId = useGameStore((s) => s.selfId)

  const ids = seatOrder.length > 0 ? seatOrder : Object.keys(players).map(Number)
  const playerNum = ids.length || 1
  const selfSeat = (selfId !== undefined && players[selfId]?.seat) || 1

  return (
    <Stage>
      {ids.map((id) => {
        const p = players[id]
        if (!p) return null
        const rel = p.seat !== undefined ? toRelativeSeat(p.seat, selfSeat, playerNum) : 0
        return <Photo key={id} player={p} relativeSeat={rel} playerNum={playerNum} isSelf={id === selfId} />
      })}
      <div style={styles.center}>
        {!useGameStore.getState().started && <span>等待开局…</span>}
      </div>
    </Stage>
  )
}

const styles: Record<string, React.CSSProperties> = {
  center: { position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)', color: '#cfe', fontSize: 16, fontFamily: 'system-ui' },
}
