// Toast.tsx — transient toast messages (M4 slice V). The VM emits notifyUI(
// "ShowToast", html) when a log line has toast=true (clientbase.lua:567); the text is
// already parseMsg-localized HTML. Mirrors the source toast surface (RootPage.qml /
// AppUtil.qml showToast): a short-lived banner near the top that auto-dismisses.
// logStore already stores the latest toast {id, html}; here we render + auto-hide it.

import { useEffect, useState } from 'react'
import { useLogStore } from '../stores/logStore.js'
import { PromptText } from './PromptText.js'

const TOAST_MS = 2500

export function Toast() {
  const toast = useLogStore((s) => s.toast)
  const [shownId, setShownId] = useState<number | null>(null)

  useEffect(() => {
    if (!toast) return
    setShownId(toast.id)
    const t = setTimeout(() => setShownId(null), TOAST_MS)
    return () => clearTimeout(t)
  }, [toast])

  if (!toast || shownId !== toast.id) return null
  return (
    <div style={styles.wrap}>
      <PromptText prompt={toast.html} style={styles.toast} />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'absolute', left: '50%', top: 80, transform: 'translateX(-50%)', zIndex: 120, pointerEvents: 'none', maxWidth: '70%' },
  toast: { background: 'rgba(0,0,0,.8)', color: '#fff', padding: '8px 18px', borderRadius: 8, fontSize: 15, textAlign: 'center', textShadow: '0 1px 2px #000', boxShadow: '0 2px 12px rgba(0,0,0,.5)' },
}
