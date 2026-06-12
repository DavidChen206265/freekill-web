// PwaUpdater — drives vite-plugin-pwa autoUpdate so a new client build is picked up
// WITHOUT the user manually clearing cache / hard-refreshing, but never interrupts a
// game in progress.
//
// Why this exists: registerType:'autoUpdate' + the injected registerSW only REGISTER
// the SW; they don't reload the page once a new SW is ready. So a user with the tab
// open keeps running the old bundle until they happen to refresh (twice). useRegisterSW
// gives us needRefresh + updateServiceWorker(true) (true = reload after activate). The
// SW already ships skipWaiting + clientsClaim, so updateServiceWorker activates the new
// SW immediately and reloads onto the new index.html + hashed bundle.
//
// Don't-interrupt rule: if the user is inside a room (enteredRoomId !== undefined —
// waiting room OR live game), a reload would drop them out, so we DON'T auto-reload.
// Instead we show a dismissable "new version" banner they can tap, and we auto-apply
// the update the moment they leave the room. In the lobby/login (no room) we just
// reload automatically.

import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useLobbyStore } from '../stores/index.js'

// Poll for a new SW periodically: by default the browser only checks on navigation /
// every ~24h, so a long-lived tab would update slowly. 60s keeps it responsive without
// hammering the origin (sw.js is tiny + no-cache → cheap 200/304).
const UPDATE_POLL_MS = 60_000

export function PwaUpdater() {
  const inRoom = useLobbyStore((s) => s.enteredRoomId !== undefined)
  const [needRefresh, setNeedRefresh] = useState(false)
  // updateServiceWorker(true) — captured from useRegisterSW; reloads after activate.
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null)

  const {
    needRefresh: [need, setNeed],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, reg) {
      if (!reg) return
      // Proactively probe for a new SW on an interval (handler-side; the page may stay
      // open for a whole session). reg.update() is a no-op when already current.
      setInterval(() => { reg.update().catch(() => { /* offline / transient */ }) }, UPDATE_POLL_MS)
    },
  })

  // Mirror the hook's needRefresh into our own state so the gating effect can react.
  useEffect(() => { setNeedRefresh(need) }, [need])
  useEffect(() => { updateRef.current = updateServiceWorker }, [updateServiceWorker])

  // Apply policy: in the lobby (not in a room) update immediately; in a room defer.
  // When the user later leaves the room while an update is pending, apply it then.
  useEffect(() => {
    if (!needRefresh) return
    if (inRoom) return // defer — show the banner instead (rendered below)
    // Not in a room → safe to reload onto the new build right now.
    void updateRef.current?.(true)
  }, [needRefresh, inRoom])

  if (!needRefresh || !inRoom) return null
  // In a room with a pending update: offer a manual apply (won't auto-interrupt the
  // game). Leaving the room triggers the effect above and auto-applies.
  return (
    <div style={overlay}>
      <button
        type="button"
        style={badge}
        onClick={() => { setNeed(false); void updateRef.current?.(true) }}
      >
        检测到新版本，点击更新（对局中不会自动刷新）
      </button>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center',
  pointerEvents: 'none', zIndex: 1001,
}
const badge: React.CSSProperties = {
  pointerEvents: 'auto', cursor: 'pointer', border: 'none',
  background: 'rgba(40,110,90,.95)', color: '#fff', padding: '8px 18px', borderRadius: 16,
  fontSize: 13, fontFamily: 'system-ui, sans-serif', boxShadow: '0 2px 12px rgba(0,0,0,.4)',
}
// pwa updater — (whitespace-safe marker for deploy test) 
