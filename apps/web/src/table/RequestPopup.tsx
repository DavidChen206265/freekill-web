// RequestPopup.tsx — modal for popup-style requests (NOT ui_emu). Reads popupStore;
// resolving replies through the gateway. Reply formats verified from RoomLogic.js:
//   AskForGeneral    → array of chosen general names
//   AskForChoice     → the chosen value string
//   AskForChoices    → array of chosen values
//   AskForCardChosen → single cid;  AskForCardsChosen → array of cids
//   AskForAG         → single cid
// (AskForSkillInvoke is ui_emu — OK/Cancel via InteractionBar, not here.)

import { useEffect, useState, useRef, useMemo } from 'react'
import { usePopupStore, shuffleInvisibleOutput, shuffleInvisiblePoxi, type PopupRequest } from '../stores/popupStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { arrangeDrop, arrangeValid, type ArrangeState } from './arrangeDrop.js'
import { CardFaceView } from './CardFaceView.js'
import { GeneralCard } from './GeneralCard.js'
import { PromptText } from './PromptText.js'
import { tr } from '../i18n/zh.js'

// Translate a (possibly dual) general name. RoomLogic.js:1125-1131 splits a
// "general/deputyGeneral" string on '/', translates EACH segment, and rejoins —
// a single tr() of the joined string misses the dict and shows raw pinyin.
function trGeneral(name: string): string {
  return name.split('/').map((p) => tr(p)).join('/')
}

export function RequestPopup() {
  const active = usePopupStore((s) => s.active)
  const resolve = usePopupStore((s) => s.resolve)
  // Selected items: general names (string[]) or card ids (number[]) depending on kind.
  const [pickedStr, setPickedStr] = useState<string[]>([])
  const [pickedNum, setPickedNum] = useState<number[]>([])

  // Reset selection whenever a new request appears.
  useEffect(() => { setPickedStr([]); setPickedNum([]) }, [active])

  // Remount the box on each NEW request so a child box can't carry internal state
  // across two back-to-back requests of the same kind (handle() makes a fresh active
  // object per request, so its identity is the request boundary). React's async
  // re-render could otherwise leave a stale box mounted for a frame.
  const epochRef = useRef({ active: null as unknown, n: 0 })
  if (epochRef.current.active !== active) { epochRef.current = { active, n: epochRef.current.n + 1 } }
  const epoch = epochRef.current.n

  if (!active) return null
  if (active.kind === 'ag') return <AgBox key={epoch} active={active} resolveAg={usePopupStore.getState().resolveAg} />
  if (active.kind === 'arrange') return <ArrangeBox key={epoch} active={active} resolve={resolve} />

  const min = active.min ?? 1
  const max = active.max ?? 1

  const toggleStr = (g: string) => setPickedStr((cur) =>
    cur.includes(g) ? cur.filter((x) => x !== g) : cur.length >= max ? [...cur.slice(1), g] : [...cur, g])
  const toggleNum = (c: number) => setPickedNum((cur) =>
    cur.includes(c) ? cur.filter((x) => x !== c) : (max === 1 ? [c] : cur.length >= max ? [...cur.slice(1), c] : [...cur, c]))

  if (active.kind === 'general') return <GeneralBox key={epoch} active={active} resolve={resolve} />
  if (active.kind === 'poxi') return <PoxiBox key={epoch} active={active} resolve={resolve} />
  if (active.kind === 'cardsAndChoice') return <CardsAndChoiceBox key={epoch} active={active} resolve={resolve} />
  if (active.kind === 'moveBoard') return <MoveBoardBox key={epoch} active={active} resolve={resolve} />
  if (active.kind === 'unsupported') return (
    // CustomDialog/MiniGame fallback: extension QML can't run in the web port, so
    // we don't stall the timer — show the notice and cancel (reply __cancel) so the
    // server proceeds.
    <Modal prompt={active.prompt}>
      <div style={styles.row}>
        <button style={styles.ok} onClick={() => resolve('__cancel')}>跳过</button>
      </div>
    </Modal>
  )

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

// PoxiBox (AskForPoxi → PoxiBox.qml): card selection whose legality comes from the
// VM's Fk.poxi_methods[poxiType]. Selectable = already-chosen OR poxiFilter allows
// it (PoxiBox.qml `selectable`); OK enabled = poxiFeasible (PoxiBox.qml OK button);
// title = poxiPrompt. Reply = the selected cid array (RoomLogic.js:1099
// replyToServer(ids)). This replaces the old min0..maxAll downgrade that could
// permit illegal selections.
function PoxiBox({ active, resolve }: { active: PopupRequest; resolve: (v: unknown) => void }) {
  const vm = useVmStore((s) => s.vm)
  const [picked, setPicked] = useState<number[]>([])
  useEffect(() => { setPicked([]) }, [active])

  const ptype = active.poxiType ?? ''
  const data = active.poxiData
  const extra = active.poxiExtra
  const vmPrompt = vm?.poxiPrompt(ptype, data, extra) || ''
  const prompt = vmPrompt || active.prompt

  // Selectable = already chosen OR the method's card_filter allows it given the
  // current selection (PoxiBox.qml: chosenInBox || Ltk.poxiFilter(...)).
  const selectable = (cid: number) => picked.includes(cid) || (vm?.poxiFilter(ptype, cid, picked, data, extra) ?? true)
  const toggle = (cid: number) => setPicked((cur) => cur.includes(cid) ? cur.filter((x) => x !== cid) : [...cur, cid])
  // OK enabled = the method's feasible(selected) (PoxiBox.qml OK.enabled).
  const ok = vm ? vm.poxiFeasible(ptype, picked, data, extra) : picked.length > 0

  return (
    <Modal prompt={prompt}>
      {(active.groups ?? []).map((grp) => (
        <div key={grp.name} style={styles.group}>
          <div style={styles.groupName}>{tr(grp.name)}</div>
          <div style={styles.cards}>
            {grp.cards.map((c) => {
              const sel = picked.includes(c.cid)
              const can = sel || selectable(c.cid)
              return (
                <button key={c.cid} style={{ ...styles.agCard, ...(sel ? styles.picked : {}), ...(can ? {} : styles.disabled) }}
                  disabled={!can} onClick={() => { if (can) toggle(c.cid) }}>
                  <CardFaceView cid={c.cid} faceUp={c.known} width={56} height={80} />
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div style={styles.row}>
        <button style={{ ...styles.ok, ...(ok ? {} : styles.disabled) }} disabled={!ok}
          onClick={() => resolve(shuffleInvisiblePoxi(active.groups ?? [], picked))}>确定</button>
        {active.cancelable && <button style={styles.ghost} onClick={() => resolve('__cancel')}>取消</button>}
      </div>
    </Modal>
  )
}

// CardsAndChoiceBox (AskForCardsAndChoice → ChooseCardsAndChoiceBox.qml): select
// min..max cards (disabled ones unselectable), then pick an OK option. OK option i
// is enabled when card count in [min,max] AND (i===0 OR vm.choiceFilter passes,
// QML:120-130). Cancel options always reply with empty cards (QML:154-161).
// Reply = { cards:[cid], choice }.
function CardsAndChoiceBox({ active, resolve }: { active: PopupRequest; resolve: (v: unknown) => void }) {
  const vm = useVmStore((s) => s.vm)
  const [picked, setPicked] = useState<number[]>([])
  useEffect(() => { setPicked([]) }, [active])

  const cards = active.ccCards ?? []
  const disabled = active.ccDisabled ?? []
  const okOptions = active.ccOkOptions ?? []
  const cancelOptions = active.ccCancelOptions ?? []
  const skel = active.ccFilterSkel ?? ''
  const extra = active.ccExtra
  const min = active.min ?? 1
  const max = active.max ?? 1

  const countOk = picked.length >= min && picked.length <= max
  const toggle = (cid: number) => {
    if (disabled.includes(cid)) return
    setPicked((cur) => cur.includes(cid) ? cur.filter((x) => x !== cid) : (max === 1 ? [cid] : cur.length >= max ? [...cur.slice(1), cid] : [...cur, cid]))
  }
  // OK option enabled: count in range AND (index 0 always, else choiceFilter).
  const okEnabled = (opt: string, i: number) =>
    countOk && (i === 0 || !skel || (vm?.choiceFilter(skel, picked, opt, extra) ?? true))

  return (
    <Modal prompt={active.prompt}>
      <div style={styles.cards}>
        {cards.map((cid) => {
          const sel = picked.includes(cid)
          const dis = disabled.includes(cid)
          return (
            <button key={cid} style={{ ...styles.agCard, ...(sel ? styles.picked : {}), ...(dis ? styles.disabled : {}) }}
              disabled={dis} onClick={() => toggle(cid)}>
              <CardFaceView cid={cid} faceUp width={56} height={80} />
            </button>
          )
        })}
      </div>
      <div style={styles.row}>
        {okOptions.map((opt, i) => {
          const on = okEnabled(opt, i)
          return <button key={`ok-${i}`} style={{ ...styles.ok, ...(on ? {} : styles.disabled) }} disabled={!on}
            onClick={() => resolve({ cards: picked, choice: opt })}>{tr(opt)}</button>
        })}
        {cancelOptions.map((opt, i) => (
          <button key={`cancel-${i}`} style={styles.ghost}
            onClick={() => resolve({ cards: [], choice: opt })}>{tr(opt)}</button>
        ))}
      </div>
    </Modal>
  )
}

// MoveBoardBox (AskForMoveCardInBoard → MoveCardInBoardBox.qml): two sides
// (sideNames[0]/[1]); each card sits on side positions[i]. Click a card to preview
// moving it to the OTHER side (only one card movable at a time). OK enabled when a
// card is picked. Reply { cardId, pos } where pos = the card's ORIGINAL position
// (room.lua:2990 decides from/to by pos). Click again to deselect.
function MoveBoardBox({ active, resolve }: { active: PopupRequest; resolve: (v: unknown) => void }) {
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => { setPicked(null) }, [active])

  const cards = active.mbCards ?? []
  const positions = active.mbPositions ?? []
  const sides = active.mbSideNames ?? ['', '']
  const origPos = (cid: number) => positions[cards.indexOf(cid)] ?? 0
  // The previewed side: the picked card shows on the opposite side; others stay.
  const sideOf = (cid: number) => (picked === cid ? 1 - origPos(cid) : origPos(cid))

  return (
    <Modal prompt={active.prompt}>
      {[0, 1].map((side) => (
        <div key={side} style={styles.group}>
          <div style={styles.groupName}>{trGeneral(sides[side] ?? '')}</div>
          <div style={styles.cards}>
            {cards.filter((cid) => sideOf(cid) === side).map((cid) => {
              const virt = active.mbVirtNames?.[String(cid)]
              return (
                <button key={cid} style={{ ...styles.agCard, ...(picked === cid ? styles.picked : {}) }}
                  onClick={() => setPicked((cur) => (cur === cid ? null : cid))}>
                  <CardFaceView cid={cid} faceUp width={56} height={80} />
                  {/* virtual-equip name overlay (e.g. equipped "as" another card) */}
                  {virt && <span style={styles.virtTag}>{tr(virt)}</span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <button style={{ ...styles.ok, ...(picked !== null ? {} : styles.disabled) }} disabled={picked === null}
        onClick={() => resolve({ cardId: picked, pos: origPos(picked!) })}>确定</button>
    </Modal>
  )
}

// AG: a shared pile; when it's your turn (AskForAG → agInteractive) you click one
// card → reply cid. Before that the pile is shown but locked (RoomLogic.js:1462
// manualBox.item.interactive). Taken cards stay in place, greyed, with the taker's
// name (AG.qml takeAG).
function AgBox({ active, resolveAg }: { active: PopupRequest; resolveAg: (cid: number) => void }) {
  const interactive = active.agInteractive !== false
  return (
    <Modal prompt={active.prompt}>
      <div style={styles.cards}>
        {(active.agCards ?? []).map(({ cid, takenBy }) => {
          const locked = !!takenBy || !interactive
          return (
            <button key={cid} style={{ ...styles.agCard, ...(takenBy ? styles.agTaken : {}) }}
              disabled={locked} onClick={() => { if (!locked) resolveAg(cid) }}>
              <CardFaceView cid={cid} faceUp width={56} height={80} />
              {takenBy && <span style={styles.agFootnote}>{takenBy}</span>}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

// Arrange (Guanxing/Exchange/ArrangeCards): assign each card into an area to meet
// Arrange (Guanxing/Exchange/ArrangeCards → GuanxingBox/ArrangeCardsBox.qml):
// assign cards into ordered areas. Reply = [[cids per area, IN ORDER]]
// (ArrangeCardsBox.getResult:414). Cards START pre-placed in their source areas
// (QML initializeCards), so "do nothing → 确定" keeps the dealt order — critical
// for Guanxing. Order within an area matters; drag reorders. isFree=false locks the
// relative order of area-0's original cards (those cards can't be reordered/moved —
// ArrangeCardsBox.qml:206 keeps org_cards[0] in place). An over-capacity area bumps
// its oldest non-just-placed card to the tray. Cancel (when cancelable) replies [].
function ArrangeBox({ active, resolve }: { active: PopupRequest; resolve: (v: unknown) => void }) {
  const areas = active.areas ?? []
  // Pre-place cards into their source areas (initialSlots); tray is empty unless a
  // request actually leaves cards unplaced. Falls back to flat tray if no slots.
  const initial = active.initialSlots
  const mkInit = (): ArrangeState => initial
    ? { slots: areas.map((_, i) => [...(initial[i] ?? [])]), tray: [] }
    : { slots: areas.map(() => []), tray: [...(active.arrangeCards ?? [])] }
  const [st, setSt] = useState<ArrangeState>(mkInit)
  const [drag, setDrag] = useState<{ cid: number; x: number; y: number } | null>(null)
  const areaRefs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => { setSt(mkInit()); setDrag(null) }, [active])

  const caps = areas.map((a) => a.capacity)
  const lims = areas.map((a) => a.limit)
  const vm = useVmStore((s) => s.vm)
  // When !isFree, area-0's original cards are locked (can't be dragged): QML keeps
  // org_cards[0] in their original relative order (ArrangeCardsBox.qml:206-238).
  // When a pattern is set, cards NOT matching it are locked too (GuanxingBox.qml:361
  // selectable: cardFitPattern). Empty/"." pattern matches all.
  const locked = useMemo(() => {
    const s = new Set<number>(active.isFree === false ? (initial?.[0] ?? []) : [])
    const pat = active.arrangePattern
    if (vm && pat && pat !== '.') {
      const all = (initial ?? []).flat().concat(active.arrangeCards ?? [])
      const fit = vm.cardFitPattern(all, pat)
      for (const cid of all) if (fit[String(cid)] === false) s.add(cid)
    }
    return s
  }, [active, initial, vm])

  const drop = (cid: number, ai: number, idx: number) => setSt((prev) => arrangeDrop(prev, caps, cid, ai, idx))

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return
    let targetArea = -1
    let insertIdx = 0
    for (let i = 0; i < areas.length; i++) {
      const el = areaRefs.current[i]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        targetArea = i
        const cardEls = Array.from(el.querySelectorAll('[data-cid]')) as HTMLElement[]
        insertIdx = cardEls.filter((c) => { const cr = c.getBoundingClientRect(); return (cr.left + cr.right) / 2 < e.clientX }).length
        break
      }
    }
    drop(drag.cid, targetArea, insertIdx)
    setDrag(null)
  }

  const valid = arrangeValid(st, caps, lims)
  const confirm = () => resolve(st.slots.map((a) => [...a]))

  const cardBtn = (cid: number) => {
    const isLocked = locked.has(cid)
    return (
      <div key={cid} data-cid={cid} style={{ ...styles.agCard, ...(drag?.cid === cid ? styles.dragging : {}), ...(isLocked ? styles.lockedCard : {}), touchAction: 'none' }}
        onPointerDown={isLocked ? undefined : (e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDrag({ cid, x: e.clientX, y: e.clientY }) }}
        onPointerMove={isLocked ? undefined : (e) => { if (drag?.cid === cid) setDrag({ cid, x: e.clientX, y: e.clientY }) }}
        onPointerUp={onPointerUp}>
        <CardFaceView cid={cid} faceUp width={56} height={80} />
      </div>
    )
  }

  return (
    <Modal prompt={active.prompt}>
      <div style={styles.groupName}>拖拽卡牌调整区域与顺序{active.isFree === false ? '(锁定牌不可移动)' : ''}</div>
      {st.tray.length > 0 && (
        <div ref={(el) => { areaRefs.current[areas.length] = el }} style={styles.cards} onPointerUp={onPointerUp}>
          {st.tray.map(cardBtn)}
        </div>
      )}
      {areas.map((a, i) => (
        <div key={i} style={styles.group}>
          <div style={styles.areaHeader}>{tr(a.name)} [{st.slots[i]?.length ?? 0}/{a.capacity}]</div>
          <div ref={(el) => { areaRefs.current[i] = el }} style={{ ...styles.cards, minHeight: 84 }} onPointerUp={onPointerUp}>
            {(st.slots[i] ?? []).map(cardBtn)}
          </div>
        </div>
      ))}
      <div style={styles.row}>
        <button style={{ ...styles.ok, ...(valid ? {} : styles.disabled) }} disabled={!valid} onClick={confirm}>确定</button>
        {active.arrangeCancelable && <button style={styles.ghost} onClick={() => resolve('__cancel')}>取消</button>}
      </div>
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
  dragging: { opacity: 0.5, border: '2px dashed #f1c40f' },
  lockedCard: { opacity: 0.7, border: '2px solid #555', cursor: 'not-allowed' },
  agTaken: { filter: 'grayscale(1) brightness(0.55)', cursor: 'default' },
  agFootnote: { position: 'absolute', left: 0, right: 0, bottom: 2, fontSize: 11, fontWeight: 700, color: '#E4D5A0', textAlign: 'center', textShadow: '0 0 2px #000, 0 0 2px #000', pointerEvents: 'none' },
  virtTag: { position: 'absolute', left: 0, right: 0, top: 2, fontSize: 10, fontWeight: 700, color: '#9fe6ff', textAlign: 'center', textShadow: '0 0 2px #000, 0 0 2px #000', pointerEvents: 'none' },
  row: { display: 'flex', gap: 10 },
  ok: { padding: '10px 28px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', fontSize: 16, cursor: 'pointer' },
  ghost: { padding: '10px 24px', border: '1px solid #555', borderRadius: 6, background: 'transparent', color: '#ccc', fontSize: 15, cursor: 'pointer' },
  disabled: { background: '#555', color: '#999', cursor: 'not-allowed' },
}
