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
import { useGameStore } from '../stores/gameStore.js'
import { arrangeDrop, arrangeValid, type ArrangeState } from './arrangeDrop.js'
import { CardFaceView } from './CardFaceView.js'
import { GeneralCard } from './GeneralCard.js'
import { useDetailStore } from '../stores/detailStore.js'
import { PromptText } from './PromptText.js'
import { tr, registerTranslations, hasTranslation } from '../i18n/zh.js'
import { useCardFaceStore } from '../stores/cardFaceStore.js'
import { Portal } from './Portal.js'
import { isTrustState } from './roomActions.js'

export const REQUEST_POPUP_Z = 100
export const FREE_ASSIGN_Z = 200

// Translate a (possibly dual) general name. RoomLogic.js:1125-1131 splits a
// "general/deputyGeneral" string on '/', translates EACH segment, and rejoins —
// a single tr() of the joined string misses the dict and shows raw pinyin.
function trGeneral(name: string): string {
  return name.split('/').map((p) => tr(p)).join('/')
}

export function RequestPopup() {
  const active = usePopupStore((s) => s.active)
  const resolve = usePopupStore((s) => s.resolve)
  const selfTrusting = useGameStore((s) => s.selfId !== undefined ? isTrustState(s.players[s.selfId]?.state) : false)
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

  if (!active || selfTrusting) return null
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

  if (active.kind === 'chooseSkill') {
    // utility/qml/ChooseSkillBox.qml: multi-select skills (min..max), reply the
    // selected skill-name array (ChooseSkillBox:97 replyToServer("", selected)).
    const skills = active.csSkills ?? []
    const ok = pickedStr.length >= min && pickedStr.length <= max
    return (
      <Modal prompt={`${active.prompt}${max > 1 ? `(${min}~${max})` : ''}`}>
        <div style={vchoicesGrid(skills.length)}>
          {skills.map((name, i) => {
            const picked = pickedStr.includes(name)
            const on = pickedStr.length < max || picked
            return <button key={i} style={{ ...styles.choice, ...(picked ? styles.picked : {}), ...(on ? {} : styles.disabled) }} disabled={!on} onClick={() => toggleStr(name)}>{tr(name)}</button>
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
  // FreeAssign cheat (ChooseGeneralBox.qml:175 → Cheat/FreeAssign.qml): when the room
  // has enableFreeAssign on, the player may replace a pick with ANY general. We read
  // the setting once and, if on, offer a "自由选将" button that opens a search-all
  // overlay; the reply stays a plain general-name array (the cheat only widens the pool).
  const [freeAssign, setFreeAssign] = useState(false)
  const [faOpen, setFaOpen] = useState(false)
  useEffect(() => { setPicked([]); setFaOpen(false) }, [active])
  useEffect(() => { setFreeAssign(!!vm?.getSetting('enableFreeAssign')) }, [vm, active])

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

  // FreeAssign overlay picks ADD to the selection (respecting count, like toggle on a
  // not-yet-picked card). A free-assigned general need not be in the offered candidates.
  const freeAssignPick = (g: string) => {
    setPicked((cur) => cur.includes(g) ? cur : cur.length >= count ? [...cur.slice(1), g] : [...cur, g])
    setFaOpen(false)
  }

  return (
    <Modal prompt={prompt}>
      <div style={styles.generals}>
        {generals.map((g) => (
          <GeneralCard key={g} name={g} selected={picked.includes(g)}
            disabled={!selectable(g)} onClick={() => { if (selectable(g)) toggle(g) }}
            onViewDetail={(name) => useDetailStore.getState().openGeneral(name)} />
        ))}
      </div>
      {/* free-assigned generals that aren't in the candidate list still need a visible
          chip so the player sees their pick (and can deselect it). */}
      {picked.some((g) => !generals.includes(g)) && (
        <div style={styles.faPicked}>
          自由选将:
          {picked.filter((g) => !generals.includes(g)).map((g) => (
            <button key={g} style={styles.faChip} onClick={() => toggle(g)}>{tr(g)} ✕</button>
          ))}
        </div>
      )}
      <div style={styles.generalBtns}>
        {freeAssign && <button style={styles.faBtn} onClick={() => setFaOpen(true)}>自由选将</button>}
        <button style={{ ...styles.ok, ...(ok ? {} : styles.disabled) }} disabled={!ok} onClick={() => resolve(picked)}>确定</button>
      </div>
      {faOpen && <FreeAssignOverlay onPick={freeAssignPick} onClose={() => setFaOpen(false)} />}
    </Modal>
  )
}

// FreeAssign all-generals search overlay (Cheat/FreeAssign.qml): a search box, pack +
// kingdom filters, and the matching general cards. Picking one calls onPick.
const FA_KINGDOMS: { value: string; label: string }[] = [
  { value: '', label: '全部势力' }, { value: 'wei', label: '魏' }, { value: 'shu', label: '蜀' },
  { value: 'wu', label: '吴' }, { value: 'qun', label: '群' }, { value: 'god', label: '神' }, { value: 'qin', label: '秦' },
]

function FreeAssignOverlay({ onPick, onClose }: { onPick: (g: string) => void; onClose: () => void }) {
  const vm = useVmStore((s) => s.vm)
  const [word, setWord] = useState('')
  const [pack, setPack] = useState('')
  const [kingdom, setKingdom] = useState('')
  // Pack list for the filter (GetAllGeneralPack). Memoized once per vm.
  const packs = useMemo(() => (vm ? vm.generalPacks() : []), [vm])
  // Search results carry {name, extension, kingdom}. Filter by kingdom client-side
  // (the VM search is by name+pack); cap render at 240.
  const raw = useMemo(() => (vm ? vm.searchGenerals(word, pack) : []), [vm, word, pack])
  const results = useMemo(
    () => (kingdom ? raw.filter((g) => g.kingdom === kingdom) : raw).slice(0, 240),
    [raw, kingdom],
  )
  // CRITICAL (#1): these names are NOT in the popup's active.generals, so vmStore never
  // registered their translations / face info → raw pinyin + no portrait. Register both
  // here whenever results change (mirrors vmStore's popup-open registration). Any future
  // on-demand general list outside active.generals MUST do the same.
  useEffect(() => {
    if (!vm || results.length === 0) return
    const keys = results.map((g) => g.name).filter((n) => !hasTranslation(n))
    if (keys.length > 0) registerTranslations(vm.translate(keys))
    const cached = useCardFaceStore.getState().generals
    const need = results.filter((g) => !cached[g.name] && g.extension)
    if (need.length > 0) {
      const info: Record<string, { extension: string; kingdom: string }> = {}
      for (const g of need) info[g.name] = { extension: g.extension, kingdom: g.kingdom }
      useCardFaceStore.getState().mergeGenerals(info)
    }
  }, [vm, results])

  return (
    <Portal>
    <div style={styles.faOverlay} onClick={onClose}>
      <div style={styles.faPanel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.faHead}>
          <span style={styles.faTitle}>自由选将</span>
          <input autoFocus style={styles.faSearch} placeholder="搜索武将名…" value={word}
            onChange={(e) => setWord(e.target.value)} />
          <select style={styles.faSelect} value={pack} onChange={(e) => setPack(e.target.value)}>
            <option value="">全部扩展包</option>
            {packs.map((p) => <option key={p} value={p}>{tr(p)}</option>)}
          </select>
          <select style={styles.faSelect} value={kingdom} onChange={(e) => setKingdom(e.target.value)}>
            {FA_KINGDOMS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <button style={styles.faClose} onClick={onClose}>关闭</button>
        </div>
        <div style={styles.faGrid}>
          {results.map((g) => (
            <GeneralCard key={g.name} name={g.name} width={72} height={100}
              onClick={() => onPick(g.name)}
              onViewDetail={(name) => useDetailStore.getState().openGeneral(name)} />
          ))}
          {results.length === 0 && <div style={styles.faEmpty}>无匹配武将</div>}
        </div>
      </div>
    </div>
    </Portal>
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
  // AG is QML's `manualBox` — a floating, draggable box (Room.qml:522 z:999), NOT a
  // modal. A concurrent request can be asked of this player WHILE the pile is shown
  // (五谷丰登 in progress → 无懈可击 via the play UI). No backdrop + draggable so the
  // Dashboard underneath stays reachable and an oversized pile can be moved aside.
  return (
    <DraggableBox prompt={active.prompt} top="12%">
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
    </DraggableBox>
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

// Modal — despite the name, NOT a blocking modal. QML's GraphicsBox (every popup) is
// a FLOATING box with a DragHandler (x+y) and NO full-screen backdrop (GraphicsBox.qml
// :32). We mirror that: a draggable, collapsible box that floats over the scene without
// a click-blocking backdrop, so an oversized box can be moved aside and concurrent
// interactions (the AG/无懈可击 case) stay reachable. Drag by the header; ➖/➕ collapses.
function Modal({ prompt, children }: { prompt: string; children: React.ReactNode }) {
  return <DraggableBox prompt={prompt}>{children}</DraggableBox>
}

function DraggableBox({ prompt, children, top }: { prompt: string; children: React.ReactNode; top?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    const cur = pos ?? { x: 0, y: 0 }
    drag.current = { px: e.clientX, py: e.clientY, ox: cur.x, oy: cur.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    setPos({ x: drag.current.ox + (e.clientX - drag.current.px), y: drag.current.oy + (e.clientY - drag.current.py) })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  // Wrapper is click-through (pointerEvents none) so the scene underneath stays usable;
  // only the box itself captures pointer events. Default centered; `pos` offsets it.
  const wrapStyle: React.CSSProperties = {
    ...styles.floatWrap,
    alignItems: top ? 'flex-start' : 'center',
    paddingTop: top ?? 0,
  }
  const boxStyle: React.CSSProperties = pos
    ? { ...styles.modal, transform: `translate(${pos.x}px, ${pos.y}px)` }
    : styles.modal!
  return (
    <Portal>
    <div style={wrapStyle}>
      <div style={boxStyle}>
        <div style={styles.boxHeader} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <PromptText prompt={prompt} style={styles.prompt} />
          <button style={styles.collapseBtn} onPointerDown={(e) => e.stopPropagation()} onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? '➕' : '➖'}
          </button>
        </div>
        {!collapsed && children}
      </div>
    </div>
    </Portal>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: REQUEST_POPUP_Z, pointerEvents: 'auto' },
  // Floating popup wrapper (GraphicsBox): centered, NO backdrop, click-through so the
  // scene/Dashboard underneath stays usable; only the box captures pointer events.
  floatWrap: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', justifyContent: 'center', zIndex: REQUEST_POPUP_Z, pointerEvents: 'none' },
  boxHeader: { display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'stretch', cursor: 'move', touchAction: 'none', justifyContent: 'space-between' },
  collapseBtn: { background: 'transparent', border: 'none', color: '#bbb', fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1, flex: '0 0 auto' },
  modal: { background: '#26262b', borderRadius: 10, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', maxWidth: 720, maxHeight: '85vh', overflowY: 'auto', color: '#eee', pointerEvents: 'auto' },
  prompt: { fontSize: 16, textAlign: 'center' },
  generals: { display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 640 },
  generalBtns: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' },
  faBtn: { padding: '10px 20px', border: '1px solid #d4af37', borderRadius: 6, background: 'transparent', color: '#d4af37', fontSize: 15, cursor: 'pointer' },
  faPicked: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', color: '#d4af37', fontSize: 13, justifyContent: 'center' },
  faChip: { padding: '2px 8px', border: '1px solid #d4af37', borderRadius: 4, background: 'rgba(212,175,55,0.15)', color: '#f1c40f', fontSize: 13, cursor: 'pointer' },
  faOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'grid', placeItems: 'center', zIndex: FREE_ASSIGN_Z },
  faPanel: { width: 'min(92vw, 760px)', height: 'min(80vh, 600px)', display: 'flex', flexDirection: 'column', background: '#26262b', borderRadius: 10, padding: 16, gap: 12 },
  faHead: { display: 'flex', gap: 8, alignItems: 'center', color: '#E4D5A0', fontSize: 15, flexWrap: 'wrap', flexShrink: 0 },
  faTitle: { fontWeight: 700, whiteSpace: 'nowrap' },
  faSearch: { flex: 1, minWidth: 120, padding: '6px 10px', border: '1px solid #555', borderRadius: 4, background: '#1a1a1a', color: '#ddd', fontSize: 14 },
  faSelect: { padding: '6px 8px', border: '1px solid #555', borderRadius: 4, background: '#1a1a1a', color: '#ddd', fontSize: 13 },
  faClose: { padding: '6px 14px', border: '1px solid #555', borderRadius: 4, background: 'transparent', color: '#ccc', cursor: 'pointer' },
  // grid scrolls WITHIN the fixed-height panel — flex:1 + minHeight:0 is what lets a
  // flex child actually overflow-scroll instead of growing the panel past the viewport (#2).
  faGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', overflowY: 'auto', flex: 1, minHeight: 0, alignContent: 'flex-start' },
  faEmpty: { color: '#888', padding: 24 },
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
