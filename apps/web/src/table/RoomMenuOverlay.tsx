import { useState } from 'react'
import { useConnectionStore } from '../stores/index.js'
import { useGameStore } from '../stores/gameStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { canConfirmSurrender, playerStateLabel, surrenderPayload, type SurrenderCheck } from './roomActions.js'

export function RoomMenuOverlay() {
  const client = useConnectionStore((s) => s.client)
  const vm = useVmStore((s) => s.vm)
  const selfId = useGameStore((s) => s.selfId)
  const self = useGameStore((s) => (s.selfId !== undefined ? s.players[s.selfId] : undefined))
  const observing = useGameStore((s) => s.observing)
  const [open, setOpen] = useState(false)
  const [checks, setChecks] = useState<SurrenderCheck[] | null>(null)

  const openSurrender = () => {
    if (!vm || observing || self?.dead) return
    const result = vm.checkSurrenderAvailable()
    setChecks(result.ok ? result.checks : [])
  }

  const confirmSurrender = () => {
    if (!vm) return
    const result = vm.checkSurrenderAvailable()
    if (canConfirmSurrender(result.checks)) client?.notify('PushRequest', surrenderPayload())
    setChecks(null)
    setOpen(false)
  }

  const toggleTrust = () => {
    client?.notify('Trust', '')
    setOpen(false)
  }

  const trustLabel = playerStateLabel(self?.state) === '托管' ? '取消托管' : '托管'

  return (
    <>
      <button style={styles.menuButton} onClick={() => setOpen((v) => !v)} title="对局菜单">菜单</button>
      {open && (
        <div style={styles.overlay}>
          <div style={styles.panel}>
            <div style={styles.header}>
              <strong>对局菜单</strong>
              <button style={styles.iconBtn} onClick={() => setOpen(false)} aria-label="关闭">×</button>
            </div>
            <button style={styles.item} disabled={observing || !!self?.dead} onClick={openSurrender}>投降</button>
            <button style={styles.item} onClick={toggleTrust}>{trustLabel}</button>
            <div style={styles.meta}>玩家 {selfId ?? '?'} {playerStateLabel(self?.state)}</div>
          </div>
        </div>
      )}
      {checks && (
        <div style={styles.dialogBackdrop}>
          <div style={styles.dialog}>
            <div style={styles.header}>
              <strong>投降</strong>
              <button style={styles.iconBtn} onClick={() => setChecks(null)} aria-label="关闭">×</button>
            </div>
            {checks.length === 0 ? (
              <p style={styles.text}>此模式禁用投降。</p>
            ) : (
              <div style={styles.checks}>
                {checks.map((c, i) => (
                  <div key={`${c.text}-${i}`} style={{ color: c.passed ? '#b8f7b8' : '#ffb3b3' }}>
                    {c.text}（{c.passed ? '✓' : '✗'}）
                  </div>
                ))}
              </div>
            )}
            <div style={styles.dialogActions}>
              <button style={styles.ghost} onClick={() => setChecks(null)}>取消</button>
              <button style={{ ...styles.danger, ...(canConfirmSurrender(checks) ? {} : styles.disabled) }} disabled={!canConfirmSurrender(checks)} onClick={confirmSurrender}>确认投降</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  menuButton: { position: 'absolute', right: 10, top: 48, zIndex: 90, padding: '6px 12px', border: '1px solid #5a4530', borderRadius: 6, background: 'rgba(40,26,16,.9)', color: '#f4e0b8', cursor: 'pointer' },
  overlay: { position: 'absolute', inset: 0, zIndex: 91, background: 'rgba(0,0,0,.22)', pointerEvents: 'auto' },
  panel: { position: 'absolute', right: 10, top: 82, width: 172, padding: 10, border: '1px solid #7b5b36', borderRadius: 8, background: 'rgba(28,22,18,.96)', color: '#f5ead6', boxShadow: '0 8px 24px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'system-ui' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14 },
  iconBtn: { border: 'none', background: 'transparent', color: '#f5ead6', fontSize: 18, cursor: 'pointer', lineHeight: 1 },
  item: { padding: '8px 10px', border: '1px solid #6b543a', borderRadius: 6, background: '#2f5f42', color: '#fff', cursor: 'pointer', fontSize: 14 },
  meta: { color: '#cdbf9f', fontSize: 12 },
  dialogBackdrop: { position: 'fixed', inset: 0, zIndex: 360, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.55)' },
  dialog: { width: 360, maxWidth: 'calc(100vw - 32px)', border: '1px solid #7b5b36', borderRadius: 8, background: '#201914', color: '#f5ead6', padding: 14, boxShadow: '0 12px 36px rgba(0,0,0,.55)', fontFamily: 'system-ui' },
  text: { margin: '14px 0', color: '#ddd' },
  checks: { display: 'flex', flexDirection: 'column', gap: 6, margin: '14px 0', fontSize: 13 },
  dialogActions: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
  ghost: { padding: '7px 12px', border: '1px solid #666', borderRadius: 6, background: 'transparent', color: '#ddd', cursor: 'pointer' },
  danger: { padding: '7px 12px', border: 'none', borderRadius: 6, background: '#9f3434', color: '#fff', cursor: 'pointer' },
  disabled: { opacity: 0.55, cursor: 'not-allowed' },
}

