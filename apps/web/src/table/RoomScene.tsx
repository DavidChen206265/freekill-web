// RoomScene.tsx — places all player Photos on the fixed stage, seated relative to
// self. Subscribes to gameStore. The table center / cards / animation come in the
// next M2 slice (R-ANIM).

import { Stage } from './Stage.js'
import { Photo } from './Photo.js'
import { CardLayer } from './CardLayer.js'
import { AnimationLayer } from './AnimationLayer.js'
import { Dashboard } from './Dashboard.js'
import { RequestPopup } from './RequestPopup.js'
import { GameLogPanel } from './GameLogPanel.js'
import { RoomChatPanel } from './RoomChatPanel.js'
import { MiscStatus } from './MiscStatus.js'
import { Toast } from './Toast.js'
import { GameOverModal } from './GameOverModal.js'
import { GeneralDetailModal } from './GeneralDetailModal.js'
import { BannerArea } from './BannerArea.js'
import { RoomMenuOverlay } from './RoomMenuOverlay.js'
import { useGameStore } from '../stores/gameStore.js'

export function RoomScene() {
  const players = useGameStore((s) => s.players)
  const seatOrder = useGameStore((s) => s.seatOrder)
  const selfId = useGameStore((s) => s.selfId)
  const started = useGameStore((s) => s.started)

  const ids = seatOrder.length > 0 ? seatOrder : Object.keys(players).map(Number)
  const playerNum = ids.length || 1

  return (
    <Stage>
      {ids.map((id) => {
        const p = players[id]
        if (!p) return null
        return <Photo key={id} player={p} playerNum={playerNum} isSelf={id === selfId} />
      })}
      <CardLayer />
      <AnimationLayer />
      <BannerArea />
      <Dashboard />
      <GameLogPanel />
      <RoomChatPanel />
      <MiscStatus />
      <RoomMenuOverlay />
      <Toast />
      <RequestPopup />
      <GameOverModal />
      <GeneralDetailModal />
      <div style={styles.center}>
        {!started && <span>等待开局…</span>}
      </div>
    </Stage>
  )
}

const styles: Record<string, React.CSSProperties> = {
  center: { position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)', color: '#cfe', fontSize: 16, fontFamily: 'system-ui' },
}
