// Dashboard.tsx — the self area along the bottom (mirrors Dashboard.qml:
// RowLayout{ HandcardArea + SkillArea }). The hand cards themselves are rendered
// by CardLayer (the floating layer, area hand:<selfId>); this adds the skill
// buttons on the right and the prompt + OK/Cancel/End bar. Skill buttons come
// from gameStore.selfSkills (always-visible) with enabled/selected overlaid from
// interactionStore.skills (set by the VM's UpdateRequestUI during a request).

import { useState, useEffect } from 'react'
import { useGameStore } from '../stores/gameStore.js'
import { useInteractionStore } from '../stores/interactionStore.js'
import type { InteractionSpec } from '../stores/interactionStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { CountdownBar } from './CountdownBar.js'
import { PromptText } from './PromptText.js'
import { tr } from '../i18n/zh.js'

export function Dashboard() {
  const started = useGameStore((s) => s.started)
  const selfSkills = useGameStore((s) => s.selfSkills)
  const active = useInteractionStore((s) => s.active)
  const prompt = useInteractionStore((s) => s.prompt)
  const buttons = useInteractionStore((s) => s.buttons)
  const skillStates = useInteractionStore((s) => s.skills)
  const specialSkills = useInteractionStore((s) => s.specialSkills)
  const interaction = useInteractionStore((s) => s.interaction)
  const interact = useVmStore((s) => s.interact)

  // Which SpecialSkills radio is checked (Room.qml RadioButton: index 0 default).
  // Reset to the first entry whenever the offered set changes (card (re)selected).
  const [specialSel, setSpecialSel] = useState<string | null>(null)
  useEffect(() => {
    setSpecialSel(specialSkills[0] ?? null)
  }, [specialSkills.join(',')])

  if (!started) return null

  const clickBtn = (id: 'OK' | 'Cancel' | 'End') => () => void interact('Button', id, 'click', {})
  const clickSkill = (name: string) => () => {
    const st = skillStates[name]
    if (!st?.enabled && !st?.selected) return
    void interact('SkillButton', name, 'click', { selected: !st?.selected })
  }
  // SpecialSkills radio (重铸/正常使用 etc.): clicking one routes the choice back
  // (Room.qml: updateRequestUI("SpecialSkills","1","click",modelData)). The first
  // entry is selected by default (RadioButton checked: index===0), matching the
  // VM which auto-selects sp_skills[1] on card select.
  const clickSpecial = (name: string) => () => {
    if (name === specialSel) return
    setSpecialSel(name)
    void interact('SpecialSkills', '1', 'click', name)
  }
  // Visible when count>1, or a single entry that isn't "_normal_use" (Room.qml:437-449).
  const showSpecial = active && specialSkills.length > 0 &&
    (specialSkills.length > 1 || specialSkills[0] !== '_normal_use')

  return (
    <div style={styles.bar}>
      {/* prompt (current request) */}
      {active && prompt && <PromptText prompt={prompt} style={styles.prompt} />}

      {/* operation countdown (Room.qml progress, above okCancel) — shows for any
          active request incl. popups; self-hides when no timer is running. */}
      <CountdownBar />

      {/* OK / Cancel — centered row above the hand cards (Room.qml `okCancel`:
          anchored to progress.horizontalCenter, sits in `controls` ABOVE the
          dashboard hand area). End is NOT here — it's a separate bottom-right
          button (endPhaseButton), so the play-phase 结束 never covers cards. */}
      {active && (
        <div style={styles.actions}>
          {okBtn('OK', '确定', buttons.OK, clickBtn('OK'))}
          {okBtn('Cancel', '取消', buttons.Cancel, clickBtn('Cancel'))}
        </div>
      )}

      {/* End phase — bottom-right corner, away from the hand cards (Room.qml
          endPhaseButton: anchors.right rightMargin:30, bottom-anchored). */}
      {active && buttons.End && (
        <div style={styles.endWrap}>
          {okBtn('End', '结束', buttons.End, clickBtn('End'))}
        </div>
      )}

      {/* SpecialSkills radio group (重铸/正常使用 — e.g. selecting 铁索连环 in the play
          phase offers ["_normal_use","recast"]). Room.qml: a RowLayout of
          RadioButtons left of the OK/Cancel row; clicking routes the choice to the
          VM. Visible only when >1 option or a lone non-"_normal_use" option. */}
      {showSpecial && (
        <div style={styles.special}>
          {specialSkills.map((name) => (
            <button
              key={name}
              onClick={clickSpecial(name)}
              style={{ ...styles.specialBtn, ...(name === specialSel ? styles.specialOn : {}) }}
            >
              <span style={styles.radioDot}>{name === specialSel ? '●' : '○'}</span>
              {tr(name)}
            </button>
          ))}
        </div>
      )}

      {/* Dynamic SkillInteraction subpanel (Room.qml:781-836). Renders the active
          combo/spin/checkbox/cardname widget; the pick routes back through the
          ui_emu loop: interact("Interaction","1","update",value). */}
      {active && interaction && (
        <div style={styles.interaction}>
          <InteractionPanel key={interaction.type} spec={interaction} onUpdate={(v) => void interact('Interaction', '1', 'update', v)} />
        </div>
      )}

      {/* skill buttons (bottom-right; hand cards are bottom-left via CardLayer).
          SkillArea.qml groups by classification: active (ActiveSkill/ViewAsSkill →
          clickable) vs notactive (locked-style, passive). limit/wake/quest skills
          carry a frequency tag. The interaction state is keyed by orig skill name. */}
      <div style={styles.skills}>
        {selfSkills.map((sk) => {
          const st = skillStates[sk.orig]
          const isActive = sk.freq === 'active'
          const usable = isActive && !!st && (st.enabled || st.selected)
          return (
            <button
              key={sk.orig}
              onClick={isActive ? clickSkill(sk.orig) : undefined}
              title={sk.frequency ? freqLabel(sk.frequency) : undefined}
              style={{
                ...styles.skill,
                ...(st?.selected ? styles.skillSelected : {}),
                ...(usable ? {} : styles.skillIdle),
                ...(isActive ? {} : styles.skillLocked),
              }}
            >
              {sk.frequency && <span style={styles.freqTag}>{freqLabel(sk.frequency)}</span>}
              {sk.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// limit/wake/quest → a short tag (限/觉/任) shown on the skill button.
function freqLabel(f: string): string {
  return f === 'limit' ? '限' : f === 'wake' ? '觉' : f === 'quest' ? '任' : ''
}

// Dynamic SkillInteraction widget (SkillInteraction/*.qml). Each subtype reports
// its value via onUpdate → interact("Interaction","1","update",value). Dispatched
// to a dedicated sub-component so React hooks stay unconditional per subtype:
//   combo/cardname : a button cycling all_choices (value = chosen string)
//   spin           : −/value/+ stepper in [from,to] (value = number)
//   checkbox       : toggle chips, min_num..max_num (value = string[])
function InteractionPanel({ spec, onUpdate }: { spec: InteractionSpec; onUpdate: (v: unknown) => void }) {
  if (spec.type === 'combo' || spec.type === 'cardname') return <ComboInteraction spec={spec} onUpdate={onUpdate} />
  if (spec.type === 'spin') return <SpinInteraction spec={spec} onUpdate={onUpdate} />
  if (spec.type === 'checkbox') return <CheckInteraction spec={spec} onUpdate={onUpdate} />
  // custom (extension QML) — not supported in the web port; render nothing.
  return null
}

// combo (SkillCombo.qml) / cardname (SkillCardName.qml): cycle through the choices.
// QML shows ALL options (all_choices) but only `choices` are ENABLED/selectable;
// cycling must land only on enabled options (the web previously cycled all_choices,
// which could report a disabled choice — audit #6). cardname's default lives in
// `default_choice` (extra_data), combo's in `default` (audit #8).
function ComboInteraction({ spec, onUpdate }: { spec: InteractionSpec; onUpdate: (v: unknown) => void }) {
  const all = spec.all_choices ?? spec.choices ?? []
  // Enabled subset to cycle through (SkillCombo box.options = choices). Fall back to
  // all when no explicit subset is given (choices === all_choices case).
  const enabled = (spec.choices && spec.choices.length > 0) ? spec.choices : all
  const initial = (spec.type === 'cardname' ? spec.default_choice : spec.default) ?? enabled[0] ?? all[0] ?? ''
  const [val, setVal] = useState<string>(initial)
  useEffect(() => { onUpdate(val) }, [])  // report the initial default (QML clicked())
  const cycle = () => {
    if (enabled.length < 2) return
    const idx = enabled.indexOf(val)
    const next = enabled[(idx + 1) % enabled.length] ?? val  // only enabled options
    setVal(next); onUpdate(next)
  }
  return <button style={styles.interactBtn} onClick={cycle}>{tr(val)}</button>
}

function SpinInteraction({ spec, onUpdate }: { spec: InteractionSpec; onUpdate: (v: unknown) => void }) {
  const from = spec.from ?? 0
  const to = spec.to ?? 0
  const [val, setVal] = useState<number>(Number(spec.default) || from)
  useEffect(() => { onUpdate(val) }, [])
  const step = (d: number) => { const n = Math.min(to, Math.max(from, val + d)); if (n !== val) { setVal(n); onUpdate(n) } }
  return (
    <div style={styles.spin}>
      <button style={styles.spinBtn} disabled={val <= from} onClick={() => step(-1)}>−</button>
      <span style={styles.spinVal}>{val}</span>
      <button style={styles.spinBtn} disabled={val >= to} onClick={() => step(1)}>+</button>
    </div>
  )
}

// checkbox (SkillCheckBox.qml): toggle chips, min_num..max_num. QML reports [] on
// creation (clicked() at Room.qml:829) and provides a Cancel that reports [] — the
// web reports the initial [] too (audit #7) and offers a 清空 (clear→[]) action when
// cancelable. min_num is gated by the VM's OK feasibility (ui_emu); max_num is
// enforced inline.
function CheckInteraction({ spec, onUpdate }: { spec: InteractionSpec; onUpdate: (v: unknown) => void }) {
  const all = spec.all_choices ?? spec.choices ?? []
  const max = spec.max_num ?? all.length
  const [picked, setPicked] = useState<string[]>([])
  useEffect(() => { onUpdate([]) }, [])  // QML SkillCheckBox.clicked() seeds [] on creation
  const toggle = (c: string) => setPicked((cur) => {
    const next = cur.includes(c) ? cur.filter((x) => x !== c) : (cur.length >= max ? cur : [...cur, c])
    onUpdate(next)
    return next
  })
  const clear = () => { setPicked([]); onUpdate([]) }
  return (
    <div style={styles.checkRow}>
      {all.map((c) => (
        <button key={c} onClick={() => toggle(c)}
          style={{ ...styles.checkChip, ...(picked.includes(c) ? styles.specialOn : {}) }}>{tr(c)}</button>
      ))}
      {spec.cancelable && <button style={styles.checkChip} onClick={clear}>清空</button>}
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
  // Vertical stack above the hand-card band (card top = STAGE_H-96 → bottom:96,
  // areas.ts). Mirrors QML `controls` (above the dashboard hand area), bottom→top:
  // okCancel, then countdown + prompt. End sits in the bottom-right corner instead.
  prompt: { position: 'absolute', left: '50%', bottom: 190, transform: 'translateX(-50%)', color: '#fff', fontSize: 14, background: 'rgba(0,0,0,.55)', padding: '4px 14px', borderRadius: 6, pointerEvents: 'auto', maxWidth: 700, textAlign: 'center', whiteSpace: 'normal', zIndex: 1 },
  actions: { position: 'absolute', left: '50%', bottom: 122, transform: 'translateX(-50%)', display: 'flex', gap: 10, pointerEvents: 'auto' },
  // End phase (Room.qml endPhaseButton: anchored bottom-right, in the dashboard
  // strip BELOW the photo row). On our compressed 1200×540 stage the self photo
  // reaches the bottom-right corner (x≈1034–1165, y≈348–523), so the original
  // right:30/bottom:40 covered it (the bug). Place End at the OK/Cancel height,
  // just LEFT of the self photo's left edge (x≈935–1025, clear of photo, of the
  // centered OK/Cancel, and of the skill button column in the lower strip).
  endWrap: { position: 'absolute', right: 375, bottom: 122, pointerEvents: 'auto' },
  // SpecialSkills radio row — left of the centered OK/Cancel (Room.qml: anchored
  // okCancel.left, rightMargin:20), same height. Light rounded pill bg like QML.
  special: { position: 'absolute', right: '50%', bottom: 122, marginRight: 90, display: 'flex', gap: 6, background: 'rgba(238,238,238,.55)', borderRadius: 8, padding: '4px 6px', pointerEvents: 'auto' },
  specialBtn: { display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 6, border: '1px solid #888', background: '#2a2723', color: '#e8d8a8', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  specialOn: { background: '#d4af37', color: '#222', borderColor: '#f1c40f' },
  radioDot: { fontSize: 11 },
  // Dynamic SkillInteraction subpanel — placed above the OK/Cancel row (like the
  // QML skillInteraction Loader, which sits in the controls strip).
  interaction: { position: 'absolute', left: '50%', bottom: 158, transform: 'translateX(-50%)', display: 'flex', gap: 6, background: 'rgba(238,238,238,.55)', borderRadius: 8, padding: '4px 6px', pointerEvents: 'auto' },
  interactBtn: { padding: '6px 16px', borderRadius: 6, border: '1px solid #888', background: '#2a2723', color: '#e8d8a8', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' },
  spin: { display: 'flex', alignItems: 'center', gap: 8 },
  spinBtn: { width: 28, height: 28, borderRadius: 6, border: '1px solid #888', background: '#2a2723', color: '#e8d8a8', fontSize: 16, cursor: 'pointer' },
  spinVal: { color: '#fff', fontSize: 16, minWidth: 24, textAlign: 'center' },
  checkRow: { display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 420 },
  checkChip: { padding: '6px 12px', borderRadius: 6, border: '1px solid #888', background: '#2a2723', color: '#e8d8a8', fontSize: 13, cursor: 'pointer' },
  skills: { position: 'absolute', right: 195, bottom: 8, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', maxHeight: 140, flexWrap: 'wrap', pointerEvents: 'auto' },
  skill: { padding: '6px 12px', borderRadius: 6, border: '1px solid #7a6a3b', background: '#3a3320', color: '#e8d8a8', fontSize: 13, cursor: 'pointer' },
  skillSelected: { background: '#d4af37', color: '#222', borderColor: '#f1c40f' },
  skillIdle: { opacity: 0.5, cursor: 'default' },
  // notactive (passive/locked) skills: greyed locked look (SkillButton locked).
  skillLocked: { background: '#2a2723', borderColor: '#5a5040', color: '#b8ac88', cursor: 'default' },
  // limit/wake/quest tag chip on the skill button.
  freqTag: { display: 'inline-block', marginRight: 4, padding: '0 3px', borderRadius: 3, background: '#7a3b3b', color: '#fff', fontSize: 10, fontWeight: 700 },
  btn: { padding: '8px 22px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', fontSize: 15, cursor: 'pointer' },
  btnDisabled: { background: '#555', color: '#999', cursor: 'not-allowed' },
}
