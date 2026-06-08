// RequestPopup.tsx — modal for popup-style requests (NOT ui_emu). Reads popupStore;
// resolving replies through the gateway. Reply formats verified from RoomLogic.js:
//   AskForGeneral    → array of chosen general names
//   AskForChoice     → the chosen value string
//   AskForChoices    → array of chosen values
//   AskForCardChosen → single cid;  AskForCardsChosen → array of cids
//   AskForAG         → single cid
// (AskForSkillInvoke is ui_emu — OK/Cancel via InteractionBar, not here.)

import { useEffect, useState } from 'react'
import { usePopupStore, shuffleInvisibleOutput, type PopupRequest } from '../stores/popupStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { CardFaceView } from './CardFaceView.js'
import { GeneralCard } from './GeneralCard.js'
import { PromptText } from './PromptText.js'
import { tr } from '../i18n/zh.js'

export function RequestPopup() {
  const active = usePopupStore((s) => s.active)
  const resolve = usePopupStore((s) => s.resolve)
  // Selected items: general names (string[]) or card ids (number[]) depending on kind.
  const [pickedStr, setPickedStr] = useState<string[]>([])
  const [pickedNum, setPickedNum] = useState<number[]>([])

  // Reset selection whenever a new request appears.
  useEffect(() => { setPickedStr([]); setPickedNum([]) }, [active])

  if (!active) return null
  if (active.kind === 'ag') return <AgBox active={active} resolve={resolve} />
  if (active.kind === 'arrange') return <ArrangeBox active={active} resolve={resolve} />

  const min = active.min ?? 1
  const max = active.max ?? 1

  const toggleStr = (g: string) => setPickedStr((cur) =>
    cur.includes(g) ? cur.filter((x) => x !== g) : cur.length >= max ? [...cur.slice(1), g] : [...cur, g])
  const toggleNum = (c: number) => setPickedNum((cur) =>
    cur.includes(c) ? cur.filter((x) => x !== c) : (max === 1 ? [c] : cur.length >= max ? [...cur.slice(1), c] : [...cur, c]))

  if (active.kind === 'general') return <GeneralBox active={active} resolve={resolve} />

  if (active.kind === 'choice') {
    // ChoiceBox.qml: render ALL options (all_choices), enable only those in
    // `choices`; reply the chosen value. Layout = GridLayout flow:TopToBottom,
    // rows:8 (fill a column top-down up to 8, then wrap to the next column).
    const all = active.values ?? active.options ?? []
    const enabledSet = active.values ? (active.options ?? []) : all
    return (
      <Modal prompt={active.prompt}>
        <div style={vchoicesGrid(all.length)}>
          {all.map((opt, i) => {
            const on = enabledSet.includes(opt)
            return <button key={i} style={{ ...styles.choice, ...(on ? {} : styles.disabled) }} disabled={!on} onClick={() => resolve(opt)}>{tr(opt)}</button>
          })}
        </div>
      </Modal>
    )
  }

  if (active.kind === 'choices') {
    // CheckBox.qml: multi-select. Render all_choices, enable those in `choices`
    // AND (selected count < max OR already picked). OK enabled when >= min.
    const all = active.values ?? active.options ?? []
    const enabledSet = active.values ? (active.options ?? []) : all
    const ok = pickedStr.length >= min && pickedStr.length <= max
    return (
      <Modal prompt={`${active.prompt}(${min}~${max})`}>
        <div style={vchoicesGrid(all.length)}>
          {all.map((opt, i) => {
            const picked = pickedStr.includes(opt)
            const on = enabledSet.includes(opt) && (pickedStr.length < max || picked)
            return <button key={i} style={{ ...styles.choice, ...(picked ? styles.picked : {}), ...(on ? {} : styles.disabled) }} disabled={!on} onClick={() => toggleStr(opt)}>{tr(opt)}</button>
          })}
        </div>
        <div style={styles.row}>
          <button style={{ ...styles.ok, ...(ok ? {} : styles.disabled) }} disabled={!ok} onClick={() => resolve(pickedStr)}>确定</button>
          {active.cancelable && <button style={styles.ghost} onClick={() => resolve('__cancel')}>取消</button>}
        </div>
      </Modal>
    )
  }

  // cards (AskForCardChosen single / AskForCardsChosen multi)
  const okCards = pickedNum.length >= min && pickedNum.length <= max
  return (
    <Modal prompt={active.prompt}>
      {(active.groups ?? []).map((grp) => (
        <div key={grp.name} style={styles.group}>
          <div style={styles.groupName}>{tr(grp.name)}</div>
          <div style={styles.cards}>
            {grp.cards.map((c) => (
              <button key={c.cid} style={{ ...styles.agCard, ...(pickedNum.includes(c.cid) ? styles.picked : {}) }} onClick={() => {
                // Single pick: shuffleInvisibleOutput — clicking a face-down card
                // replies a RANDOM back from the same area (PlayerCardBox.qml, so
                // you can't reveal which back you chose). Visible cards reply as-is.
                if (max === 1) { resolve(shuffleInvisibleOutput(active.groups ?? [], c.cid)); return }
                toggleNum(c.cid)
              }}><CardFaceView cid={c.cid} faceUp={c.known} width={56} height={80} /></button>
            ))}
          </div>
        </div>
      ))}
      {(max > 1 || active.cancelable) && (
        <div style={styles.row}>
          {max > 1 && (
            <button style={{ ...styles.ok, ...(okCards ? {} : styles.disabled) }} disabled={!okCards} onClick={() => resolve(pickedNum)}>确定</button>
          )}
          {/* cancelable card requests (e.g. AskForPoxi/CardsChosen min 0) → reply __cancel */}
          {active.cancelable && <button style={styles.ghost} onClick={() => resolve('__cancel')}>取消</button>}
        </div>
      )}
    </Modal>
  )
}

// GeneralBox (ChooseGeneralBox.qml): choose `count` generals. Portrait cards via
// GeneralCard; the VM rules drive it — chooseGeneralPrompt (dynamic prompt),
// chooseGeneralFilter (per-candidate selectability; already-chosen always allowed),
// chooseGeneralFeasible (OK enabled). Reply = selected names array (box.choices).
function GeneralBox({ active, resolve }: { active: PopupRequest; resolve: (v: unknown) => void }) {
  const vm = useVmStore((s) => s.vm)
  const [picked, setPicked] = useState<string[]>([])
  useEffect(() => { setPicked([]) }, [active])

  const generals = active.generals ?? []
  const rule = active.ruleType ?? 'askForGeneralsChosen'
  const extra = active.extraData
  const count = active.count ?? 1

  // Dynamic prompt from the rule (fallback to the static prompt).
  const vmPrompt = vm?.chooseGeneralPrompt(rule, generals, extra) || ''
  const prompt = vmPrompt ? vmPrompt : `${active.prompt}(选 ${count} 个)`

  const toggle = (g: string) => setPicked((cur) =>
    cur.includes(g) ? cur.filter((x) => x !== g) : cur.length >= count ? [...cur.slice(1), g] : [...cur, g])

  // Selectable = already chosen OR the rule's filter allows it (QML line 235-237).
  const selectable = (g: string) => picked.includes(g) || (vm?.chooseGeneralFilter(rule, g, picked, generals, extra) ?? true)
  // OK enabled by the rule's feasible (QML line 230); fall back to exact count.
  const ok = vm ? vm.chooseGeneralFeasible(rule, picked, generals, extra) : picked.length === count

  return (
    <Modal prompt={prompt}>
      <div style={styles.generals}>
        {generals.map((g) => (
          <GeneralCard key={g} name={g} selected={picked.includes(g)}
            disabled={!selectable(g)} onClick={() => { if (selectable(g)) toggle(g) }} />
        ))}
      </div>
      <button style={{ ...styles.ok, ...(ok ? {} : styles.disabled) }} disabled={!ok} onClick={() => resolve(picked)}>确定</button>
    </Modal>
  )
}

// AG: a shared pile; when it's your turn (prompt set) you click one card → reply
// cid. Taken cards stay in place, greyed, with the taker's name (AG.qml takeAG).
function AgBox({ active, resolve }: { active: PopupRequest; resolve: (v: unknown) => void }) {
  return (
    <Modal prompt={active.prompt}>
      <div style={styles.cards}>
        {(active.agCards ?? []).map(({ cid, takenBy }) => (
          <button key={cid} style={{ ...styles.agCard, ...(takenBy ? styles.agTaken : {}) }}
            disabled={!!takenBy} onClick={() => { if (!takenBy) resolve(cid) }}>
            <CardFaceView cid={cid} faceUp width={56} height={80} />
            {takenBy && <span style={styles.agFootnote}>{takenBy}</span>}
          </button>
        ))}
      </div>
    </Modal>
  )
}

// Arrange (Guanxing/Exchange/ArrangeCards): assign each card into an area to meet
// each area's capacity. Downgrade of the QML drag box — click a card, then an
// area button. Reply = [[cids per area]] (GuanxingBox.getResult shape).
function ArrangeBox({ active, resolve }: { active: PopupRequest; resolve: (v: unknown) => void }) {
  const areas = active.areas ?? []
  const allCards = active.arrangeCards ?? []
  // placement[cid] = area index (or undefined = unplaced)
  const [placement, setPlacement] = useState<Record<number, number>>({})
  const [sel, setSel] = useState<number | null>(null)
  useEffect(() => { setPlacement({}); setSel(null) }, [active])

  const place = (areaIdx: number) => {
    if (sel == null) return
    setPlacement((p) => ({ ...p, [sel]: areaIdx }))
    setSel(null)
  }
  const unplaced = allCards.filter((c) => placement[c] === undefined)
  const inArea = (i: number) => allCards.filter((c) => placement[c] === i)
  // Valid when every area is within [limit, capacity] and all cards placed.
  const valid = unplaced.length === 0 && areas.every((a, i) => {
    const n = inArea(i).length
    return n >= a.limit && n <= a.capacity
  })
  const confirm = () => resolve(areas.map((_, i) => inArea(i)))

  return (
    <Modal prompt={active.prompt}>
      <div style={styles.groupName}>待分配(点选后再点区域)</div>
      <div style={styles.cards}>
        {unplaced.map((cid) => (
          <button key={cid} style={{ ...styles.agCard, ...(sel === cid ? styles.picked : {}) }} onClick={() => setSel(cid)}>
            <CardFaceView cid={cid} faceUp width={56} height={80} />
          </button>
        ))}
        {unplaced.length === 0 && <span style={{ color: '#888' }}>(全部已分配)</span>}
      </div>
      {areas.map((a, i) => (
        <div key={i} style={styles.group}>
          <button style={styles.areaHeader} onClick={() => place(i)}>{tr(a.name)} [{inArea(i).length}/{a.capacity}]</button>
          <div style={styles.cards}>
            {inArea(i).map((cid) => (
              <button key={cid} style={styles.agCard} onClick={() => setPlacement((p) => { const n = { ...p }; delete n[cid]; return n })}>
                <CardFaceView cid={cid} faceUp width={56} height={80} />
              </button>
            ))}
          </div>
        </div>
      ))}
      <button style={{ ...styles.ok, ...(valid ? {} : styles.disabled) }} disabled={!valid} onClick={confirm}>确定</button>
    </Modal>
  )
}

// ChoiceBox/CheckBox.qml use GridLayout{ flow:TopToBottom; rows:8 } — options fill
// a column top-down (max 8), then wrap to a new column. Emulate with a CSS grid
// that has ceil(n/8) columns, each filled column-first via grid-auto-flow:column.
function vchoicesGrid(n: number): React.CSSProperties {
  const rows = Math.min(8, Math.max(1, n))
  return {
    display: 'grid',
    gridAutoFlow: 'column',
    gridTemplateRows: `repeat(${rows}, auto)`,
    gap: 8,
    columnGap: 10,
    justifyContent: 'center',
  }
}

function Modal({ prompt, children }: { prompt: string; children: React.ReactNode }) {  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <PromptText prompt={prompt} style={styles.prompt} />
        {children}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 100, pointerEvents: 'auto' },
  modal: { background: '#26262b', borderRadius: 10, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', maxWidth: 720, maxHeight: '85vh', overflowY: 'auto', color: '#eee' },
  prompt: { fontSize: 16, textAlign: 'center' },
  generals: { display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 640 },
  picked: { border: '2px solid #f1c40f', outline: '2px solid #f1c40f' },
  choices: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  choice: { padding: '10px 24px', borderRadius: 6, border: '2px solid transparent', background: '#0e639c', color: '#fff', fontSize: 15, cursor: 'pointer' },
  group: { width: '100%' },
  groupName: { fontSize: 13, color: '#aaa', marginBottom: 4 },
  areaHeader: { fontSize: 13, color: '#eee', marginBottom: 4, padding: '4px 12px', borderRadius: 4, border: '1px dashed #4ec9b0', background: 'transparent', cursor: 'pointer' },
  cards: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  cardBtn: { width: 56, height: 80, borderRadius: 6, border: '2px solid #444', background: '#f5f0e1', color: '#222', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  agCard: { position: 'relative', padding: 0, borderRadius: 6, border: '2px solid transparent', background: 'transparent', cursor: 'pointer' },
  agTaken: { filter: 'grayscale(1) brightness(0.55)', cursor: 'default' },
  agFootnote: { position: 'absolute', left: 0, right: 0, bottom: 2, fontSize: 11, fontWeight: 700, color: '#E4D5A0', textAlign: 'center', textShadow: '0 0 2px #000, 0 0 2px #000', pointerEvents: 'none' },
  row: { display: 'flex', gap: 10 },
  ok: { padding: '10px 28px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', fontSize: 16, cursor: 'pointer' },
  ghost: { padding: '10px 24px', border: '1px solid #555', borderRadius: 6, background: 'transparent', color: '#ccc', fontSize: 15, cursor: 'pointer' },
  disabled: { background: '#555', color: '#999', cursor: 'not-allowed' },
}
