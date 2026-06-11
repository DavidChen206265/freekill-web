// GeneralDetailModal.tsx — the right-click player/general detail panel, a focused
// port of PlayerDetail.qml (DET1b) + GeneralDetailPage skill list (DET2/DET3).
// Shows: screen name, the player's general portrait(s) (GeneralCard), and the
// visible skills with descriptions (VM GetPlayerSkills). Scope: the basics that a
//身份局 needs (inspect an opponent's general + skills); presents/stats/audio/skins
// are out of this batch. Skills fetched once when opened.

import { useEffect, useRef, useState } from 'react'
import { useDetailStore } from '../stores/detailStore.js'
import { useGameStore } from '../stores/gameStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { GeneralCard } from './GeneralCard.js'
import { suitSymbol, isRedSuit, numberStr } from '../stores/cardFaceStore.js'
import { tr, hasTranslation, registerTranslations } from '../i18n/zh.js'
import type { PlayerCardInfo, GeneralDetail } from '../vm/clientVm.js'

export function GeneralDetailModal() {
  const pid = useDetailStore((s) => s.pid)
  const generalName = useDetailStore((s) => s.generalName)
  const close = useDetailStore((s) => s.close)
  const players = useGameStore((s) => s.players)
  const vm = useVmStore((s) => s.vm)
  const [skills, setSkills] = useState<{ name: string; description: string }[]>([])
  // IG-4: the player's visible equip + judge cards (incl. virtual cards' original).
  const [cards, setCards] = useState<{ cards: PlayerCardInfo[]; unknown: number }>({ cards: [], unknown: 0 })
  // IG-6: general-pick skill view (by name, no player). Skills already localized.
  const [genDetail, setGenDetail] = useState<GeneralDetail>({ skill: [] })
  // The long-press / right-click that opens this modal is followed by a synthetic
  // click (on pointer-up) that would otherwise hit the backdrop and close it at
  // once. Ignore backdrop clicks for a brief grace window after opening.
  const openedAt = useRef(0)

  const player = pid != null ? players[pid] : undefined

  useEffect(() => {
    if (pid == null || !vm) { setSkills([]); setCards({ cards: [], unknown: 0 }); return }
    openedAt.current = Date.now()
    setSkills(vm.playerSkills(pid))
    const pc = vm.playerCards(pid)
    setCards(pc)
    // Localize the card names + their description keys (":"+name) + virtual names —
    // PlayerDetail.qml shows tr(name) + tr(":"+name). Fetch any uncached keys once.
    const keys = new Set<string>()
    for (const c of pc.cards) {
      for (const k of [c.name, ':' + c.name, c.virtName, c.virtName ? ':' + c.virtName : '']) {
        if (k && !hasTranslation(k)) keys.add(k)
      }
    }
    if (keys.size > 0) registerTranslations(vm.translate([...keys]))
  }, [pid, vm])

  // IG-6: fetch the general's full skill list by name (GetGeneralDetail).
  useEffect(() => {
    if (generalName == null || !vm) { setGenDetail({ skill: [] }); return }
    openedAt.current = Date.now()
    setGenDetail(vm.generalDetail(generalName))
    if (!hasTranslation(generalName)) registerTranslations(vm.translate([generalName]))
  }, [generalName, vm])

  // IG-6: general-pick skill view — portrait + full skills (no player context).
  if (generalName != null) {
    const onBackdropG = () => { if (Date.now() - openedAt.current > 350) close() }
    return (
      <div style={styles.backdrop} onClick={onBackdropG}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div style={styles.header}>
            <span style={styles.name}>{tr(generalName)}</span>
            <button style={styles.close} onClick={close}>×</button>
          </div>
          <div style={styles.body}>
            <div style={styles.portraits}>
              <GeneralCard name={generalName} width={93} height={130} />
            </div>
            <div style={styles.skills}>
              {genDetail.skill.length === 0 && <div style={styles.noSkill}>无技能信息</div>}
              {genDetail.skill.map((s, i) => (
                <div key={i} style={styles.skill}>
                  <span style={{ ...styles.skillName, ...(s.related ? styles.relatedSkill : {}) }}>{s.name}</span>
                  <span style={styles.skillDesc}>{s.description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (pid == null || !player) return null

  const onBackdrop = () => { if (Date.now() - openedAt.current > 350) close() }

  return (
    <div style={styles.backdrop} onClick={onBackdrop}>
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
            {/* IG-4: visible equip/judge cards (PlayerDetail.qml:291-312). A virtual
                card shows its ORIGINAL card name+suit+number in parens, then the
                transformed name — e.g. (无中生有♥A)乐不思蜀: <描述>. */}
            {(cards.cards.length > 0 || cards.unknown > 0) && (
              <div style={styles.cardSection}>
                <div style={styles.cardHead}>装备 / 判定区</div>
                {cards.cards.map((c) => <CardLine key={c.cid} c={c} />)}
                {cards.unknown > 0 && <div style={styles.noSkill}>另有 {cards.unknown} 张未明牌</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// One visible equip/judge card line (PlayerDetail.qml card append). For a virtual card
// the parenthesized part is the ORIGINAL physical card (name + suit symbol + rank); the
// bold lead is the virtual name. Description = tr(":"+name).
function CardLine({ c }: { c: PlayerCardInfo }) {
  const suit = suitSymbol(c.suit)
  const rank = numberStr(c.number)
  // Dark modal bg → red suits red, black suits light grey (a pure-black ♠ would vanish).
  const suitStyle = { color: isRedSuit(c.suit) ? '#e06666' : '#ccc' }
  if (c.virtName) {
    return (
      <div style={styles.cardLine}>
        <span style={styles.cardName}>
          (<span>{tr(c.name)}</span><span style={suitStyle}>{suit}</span><span>{rank}</span>)
          {tr(c.virtName)}
        </span>
        <span style={styles.cardDesc}>{tr(':' + c.virtName)}</span>
      </div>
    )
  }
  return (
    <div style={styles.cardLine}>
      <span style={styles.cardName}>{tr(c.name)}(<span style={suitStyle}>{suit}</span>{rank})</span>
      <span style={styles.cardDesc}>{tr(':' + c.name)}</span>
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
  relatedSkill: { color: '#c08fe0' },
  skillDesc: { color: '#E4D5A0' },
  cardSection: { marginTop: 8, paddingTop: 10, borderTop: '1px solid #444', display: 'flex', flexDirection: 'column', gap: 8 },
  cardHead: { color: '#bbb', fontSize: 13, fontWeight: 700 },
  cardLine: { display: 'block' },
  cardName: { color: '#E4D5A0', fontWeight: 700, fontSize: 16, marginRight: 8 },
  cardDesc: { color: '#E4D5A0', fontSize: 14 },
}
