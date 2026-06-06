// App.tsx — top-level routing: login screen until online, then the lobby.

import { useConnectionStore } from './stores/index.js'
import { LoginPage } from './pages/LoginPage.js'
import { LobbyPage } from './pages/LobbyPage.js'

export function App() {
  const status = useConnectionStore((s) => s.status)
  return status === 'online' ? <LobbyPage /> : <LoginPage />
}
