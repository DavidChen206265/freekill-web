// RequestPopup.tsx — modal for popup-style requests (AskForGeneral / AskForChoice
// / AskForSkillInvoke). Reads popupStore; resolving replies through the gateway.
// general/choice values are sent verbatim (reply formats from RoomLogic.js:
// AskForGeneral → array of chosen names; AskForChoice → the chosen value string;
// AskForSkillInvoke → "1" / "__cancel").

import { useState } from 'react'
import { usePopupStore } from '../stores/popupStore.js'
import { tr } from '../i18n/zh.js'

export function RequestPopup() {
  const active = usePopupStore((s) => s.active)
  const resolve = usePopupStore((s) => s.resolve)
  const [picked, setPicked] = useState<string[]>([])

  if (!active) return null

  if (active.kind === 'general') {
    const count = active.count ?? 1
    const toggle = (g: string) => {
      setPicked((cur) => {
        if (cur.includes(g)) return cur.filter((x) => x !== g)
        if (cur.length >= count) return [...cur.slice(1), g] // keep last `count`
        return [...cur, g]
      })
    }
    const confirm = () => { resolve(picked); setPicked([]) }
    return (
      <Modal prompt={`${active.prompt}(选 ${count} 个)`}>
        <div style={styles.generals}>
          {(active.generals ?? []).map((g) => (
            <button
              key={g}
              style={{ ...styles.general, ...(picked.includes(g) ? styles.generalPicked : {}) }}
              onClick={() => toggle(g)}
            >{tr(g)}</button>
          ))}
        </div>
        <button style={{ ...styles.ok, ...(picked.length === count ? {} : styles.disabled) }} disabled={picked.length !== count} onClick={confirm}>确定</button>
      </Modal>
    )
  }

  if (active.kind === 'choice') {
    return (
      <Modal prompt={active.prompt}>
        <div style={styles.choices}>
          {(active.options ?? []).map((opt, i) => (
            <button key={i} style={styles.choice} onClick={() => resolve((active.values ?? active.options)![i])}>{tr(opt)}</button>
          ))}
        </div>
      </Modal>
    )
  }

  // skillInvoke: yes/no
  return (
    <Modal prompt={active.prompt || `是否发动 ${tr(active.skill ?? '')}?`}>
      <div style={styles.choices}>
        <button style={styles.ok} onClick={() => resolve('1')}>是</button>
        <button style={styles.ghost} onClick={() => resolve('__cancel')}>否</button>
      </div>
    </Modal>
  )
}

function Modal({ prompt, children }: { prompt: string; children: React.ReactNode }) {
  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <div style={styles.prompt}>{prompt}</div>
        {children}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 100, pointerEvents: 'auto' },
  modal: { background: '#26262b', borderRadius: 10, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', maxWidth: 700, color: '#eee' },
  prompt: { fontSize: 16, textAlign: 'center' },
  generals: { display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 640 },
  general: { width: 90, height: 120, borderRadius: 6, border: '2px solid #444', background: '#3b5b8c', color: '#fff', fontSize: 14, cursor: 'pointer', padding: 4 },
  generalPicked: { border: '2px solid #f1c40f', outline: '2px solid #f1c40f' },
  choices: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  choice: { padding: '10px 24px', borderRadius: 6, border: 'none', background: '#0e639c', color: '#fff', fontSize: 15, cursor: 'pointer' },
  ok: { padding: '10px 28px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', fontSize: 16, cursor: 'pointer' },
  ghost: { padding: '10px 24px', border: '1px solid #555', borderRadius: 6, background: 'transparent', color: '#ccc', fontSize: 15, cursor: 'pointer' },
  disabled: { background: '#555', color: '#999', cursor: 'not-allowed' },
}
