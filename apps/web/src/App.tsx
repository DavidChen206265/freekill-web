// App.tsx — top-level routing: login screen until online, then the lobby.
// On mount, attempt auto-login from persisted credentials (R2 seamless reconnect
// across hard refresh / browser restart). While an unexpected drop is being
// retried we keep showing the lobby/room with a reconnecting overlay instead of
// bouncing back to the login screen.

import { useEffect } from 'react'
import { useConnectionStore } from './stores/index.js'
import { LoginPage } from './pages/LoginPage.js'
import { LobbyPage } from './pages/LobbyPage.js'
import { PwaUpdater } from './pwa/PwaUpdater.js'

export function App() {
  const status = useConnectionStore((s) => s.status)
  const reconnecting = useConnectionStore((s) => s.reconnecting)
  const tryAutoLogin = useConnectionStore((s) => s.tryAutoLogin)

  // Auto-login once on mount from persisted credentials (if any).
  useEffect(() => { tryAutoLogin() }, [tryAutoLogin])

  // Stay on the lobby/room view while reconnecting so a mid-game WS drop doesn't
  // throw the player back to login — asio holds their seat (Run state) and the
  // re-login triggers a Reconnect resend that rebuilds the table.
  const showLobby = status === 'online' || reconnecting
  return (
    <>
      {showLobby ? <LobbyPage /> : <LoginPage />}
      {reconnecting && (
        <div style={overlay}>
          <div style={badge}>连接断开,正在重连…</div>
        </div>
      )}
      {/* PWA self-update: reloads onto a new build automatically in the lobby, defers
          (shows a tap-to-update banner) while in a room so a game isn't interrupted. */}
      <PwaUpdater />
    </>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', top: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center',
  pointerEvents: 'none', zIndex: 1000,
}
const badge: React.CSSProperties = {
  background: 'rgba(180,60,40,.92)', color: '#fff', padding: '6px 16px', borderRadius: 16,
  fontSize: 13, fontFamily: 'system-ui, sans-serif', boxShadow: '0 2px 12px rgba(0,0,0,.4)',
}
