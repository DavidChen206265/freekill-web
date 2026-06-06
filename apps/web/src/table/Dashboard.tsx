// Dashboard.tsx — the self area along the bottom (mirrors Dashboard.qml:
// RowLayout{ HandcardArea + SkillArea }). The hand cards themselves are rendered
// by CardLayer (the floating layer, area hand:<selfId>); this adds the skill
// buttons on the right and the prompt + OK/Cancel/End bar. Skill buttons come
// from gameStore.selfSkills (always-visible) with enabled/selected overlaid from
// interactionStore.skills (set by the VM's UpdateRequestUI during a request).

import { useGameStore } from '../stores/gameStore.js'
import { useInteractionStore } from '../stores/interactionStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { tr } from '../i18n/zh.js'

export function Dashboard() {
  const started = useGameStore((s) => s.started)
  const selfSkills = useGameStore((s) => s.selfSkills)
  const active = useInteractionStore((s) => s.active)
  const prompt = useInteractionStore((s) => s.prompt)
  const buttons = useInteractionStore((s) => s.buttons)
  const skillStates = useInteractionStore((s) => s.skills)
  const interact = useVmStore((s) => s.interact)

  if (!started) return null

  const clickBtn = (id: 'OK' | 'Cancel' | 'End') => () => void interact('Button', id, 'click', {})
  const clickSkill = (name: string) => () => {
    const st = skillStates[name]
    if (!st?.enabled && !st?.selected) return
    void interact('SkillButton', name, 'click', { selected: !st?.selected })
  }

  return (
    <div style={styles.bar}>
      {/* prompt (current request) */}
      {active && prompt && <div style={styles.prompt}>{prompt}</div>}

      {/* OK / Cancel / End (centered) — only during a request */}
      {active && (
        <div style={styles.actions}>
          {okBtn('OK', '确定', buttons.OK, clickBtn('OK'))}
          {okBtn('Cancel', '取消', buttons.Cancel, clickBtn('Cancel'))}
          {okBtn('End', '结束', buttons.End, clickBtn('End'))}
        </div>
      )}

      {/* skill buttons (bottom-right; hand cards are bottom-left via CardLayer) */}
      <div style={styles.skills}>
        {selfSkills.map((name) => {
          const st = skillStates[name]
          const usable = !!st && (st.enabled || st.selected)
          return (
            <button
              key={name}
              onClick={clickSkill(name)}
              style={{
                ...styles.skill,
                ...(st?.selected ? styles.skillSelected : {}),
                ...(usable ? {} : styles.skillIdle),
              }}
            >{tr(name)}</button>
          )
        })}
      </div>
    </div>
  )
}

function okBtn(id: string, label: string, st: { enabled: boolean } | undefined, onClick: () => void) {
  if (!st) return null
  return (
    <button key={id} disabled={!st.enabled} onClick={onClick}
      style={{ ...styles.btn, ...(st.enabled ? {} : styles.btnDisabled) }}>{label}</button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 150,
    pointerEvents: 'none', zIndex: 80,
  },
  prompt: { position: 'absolute', left: '50%', bottom: 90, transform: 'translateX(-50%)', color: '#fff', fontSize: 14, background: 'rgba(0,0,0,.55)', padding: '4px 14px', borderRadius: 6, pointerEvents: 'auto', maxWidth: 700, textAlign: 'center', whiteSpace: 'nowrap' },
  actions: { position: 'absolute', left: '50%', bottom: 50, transform: 'translateX(-50%)', display: 'flex', gap: 10, pointerEvents: 'auto' },
  skills: { position: 'absolute', right: 12, bottom: 8, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', maxHeight: 140, flexWrap: 'wrap', pointerEvents: 'auto' },
  skill: { padding: '6px 12px', borderRadius: 6, border: '1px solid #7a6a3b', background: '#3a3320', color: '#e8d8a8', fontSize: 13, cursor: 'pointer' },
  skillSelected: { background: '#d4af37', color: '#222', borderColor: '#f1c40f' },
  skillIdle: { opacity: 0.5, cursor: 'default' },
  btn: { padding: '8px 22px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', fontSize: 15, cursor: 'pointer' },
  btnDisabled: { background: '#555', color: '#999', cursor: 'not-allowed' },
}
