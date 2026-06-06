// InteractionBar.tsx — prompt + OK/Cancel/End buttons for the active request.
// Reads interactionStore; clicks route to the VM via vmStore.interact("Button",...).

import { useInteractionStore } from '../stores/interactionStore.js'
import { useVmStore } from '../stores/vmStore.js'

export function InteractionBar() {
  const active = useInteractionStore((s) => s.active)
  const prompt = useInteractionStore((s) => s.prompt)
  const buttons = useInteractionStore((s) => s.buttons)
  const interact = useVmStore((s) => s.interact)

  if (!active) return null

  const click = (id: 'OK' | 'Cancel' | 'End') => () => void interact('Button', id, 'click', {})
  const btn = (id: 'OK' | 'Cancel' | 'End', label: string) => {
    const b = buttons[id]
    if (!b) return null
    return (
      <button
        style={{ ...styles.btn, ...(b.enabled ? {} : styles.disabled) }}
        disabled={!b.enabled}
        onClick={click(id)}
      >{label}</button>
    )
  }

  return (
    <div style={styles.bar}>
      {prompt && <span style={styles.prompt}>{prompt}</span>}
      <div style={styles.btns}>
        {btn('OK', '确定')}
        {btn('Cancel', '取消')}
        {btn('End', '结束')}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 90,
    background: 'rgba(0,0,0,.5)', padding: '8px 16px', borderRadius: 8, pointerEvents: 'auto',
  },
  prompt: { color: '#fff', fontSize: 14, maxWidth: 600, textAlign: 'center' },
  btns: { display: 'flex', gap: 10 },
  btn: { padding: '6px 20px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', fontSize: 15, cursor: 'pointer' },
  disabled: { background: '#555', color: '#999', cursor: 'not-allowed' },
}
