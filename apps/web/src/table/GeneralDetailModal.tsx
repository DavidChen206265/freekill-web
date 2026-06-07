// GeneralDetailModal.tsx — the right-click player/general detail panel, a focused
// port of PlayerDetail.qml (DET1b) + GeneralDetailPage skill list (DET2/DET3).
// Shows: screen name, the player's general portrait(s) (GeneralCard), and the
// visible skills with descriptions (VM GetPlayerSkills). Scope: the basics that a
//身份局 needs (inspect an opponent's general + skills); presents/stats/audio/skins
// are out of this batch. Skills fetched once when opened.

import { useEffect, useState } from 'react'
import { useDetailStore } from '../stores/detailStore.js'
import { useGameStore } from '../stores/gameStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { GeneralCard } from './GeneralCard.js'

export function GeneralDetailModal() {
  const pid = useDetailStore((s) => s.pid)
  const close = useDetailStore((s) => s.close)
  const players = useGameStore((s) => s.players)
  const vm = useVmStore((s) => s.vm)
  const [skills, setSkills] = useState<{ name: string; description: string }[]>([])

  const player = pid != null ? players[pid] : undefined

  useEffect(() => {
    if (pid == null || !vm) { setSkills([]); return }
    setSkills(vm.playerSkills(pid))
  }, [pid, vm])

  if (pid == null || !player) return null

  return (
    <div style={styles.backdrop} onClick={close}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.name}>{player.name || `P${player.id}`}</span>
          <button style={styles.close} onClick={close}>×</button>
        </div>
        <div style={styles.body}>
          {/* general portrait(s) (PlayerDetail mainChara/deputyChara) */}
          <div style={styles.portraits}>
            {player.general && <GeneralCard name={player.general} width={93} height={130} />}
            {player.deputyGeneral && <GeneralCard name={player.deputyGeneral} width={93} height={130} />}
          </div>
          {/* visible skills + descriptions (GetPlayerSkills) */}
          <div style={styles.skills}>
            {skills.length === 0 && <div style={styles.noSkill}>无可见技能</div>}
            {skills.map((s, i) => (
              <div key={i} style={styles.skill}>
                <span style={styles.skillName}>{s.name}</span>
                <span style={styles.skillDesc}>{s.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 120, pointerEvents: 'auto' },
  modal: { background: '#26262b', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', color: '#E4D5A0' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  name: { fontSize: 18, fontWeight: 700 },
  close: { border: 'none', background: 'transparent', color: '#ccc', fontSize: 22, lineHeight: 1, cursor: 'pointer' },
  body: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  portraits: { display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 },
  skills: { display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15, lineHeight: 1.5, minWidth: 280 },
  noSkill: { color: '#888' },
  skill: { display: 'block' },
  skillName: { color: '#9FD49C', fontWeight: 700, fontSize: 17, marginRight: 8 },
  skillDesc: { color: '#E4D5A0' },
}
