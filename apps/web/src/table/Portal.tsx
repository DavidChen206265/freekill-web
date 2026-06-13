// Portal.tsx — render children into document.body, escaping the scaled game Stage
// (Stage.tsx applies transform: scale(...) to a 1200×540 box; a position:fixed/absolute
// descendant of a transformed element is positioned relative to THAT element, not the
// viewport — so modals mounted inside the stage get clipped and their maxHeight:85vh +
// overflowY scroll don't work against the real screen). Portaling to body fixes it:
// the modal's backdrop (position:fixed inset:0) then covers the true viewport and its
// inner panel can scroll. Use for any full-screen overlay rendered from inside RoomScene.

import { useState, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Portal({ children }: { children: ReactNode }) {
  const [el] = useState(() => (typeof document !== 'undefined' ? document.createElement('div') : null))
  useEffect(() => {
    if (!el) return
    document.body.appendChild(el)
    return () => { document.body.removeChild(el) }
  }, [el])
  if (!el) return null
  return createPortal(children, el)
}
