// popupStore.ts — "popup" requests that are NOT ui_emu (notify + direct reply):
// AskForGeneral (choose general — every game starts with this), AskForChoice
// (pick one option), AskForSkillInvoke (yes/no). The VM forwards these as raw
// notifyUI; the player picks in React and we reply via the gateway (requestId
// stamped by the gateway). See memory ui-emu-request-architecture (two request
// kinds). Distinct from interactionStore (UpdateRequestUI / ui_emu).

import { create } from 'zustand'
import { useTimerStore } from './timerStore.js'
import { useGameStore } from './gameStore.js'
import { tr } from '../i18n/zh.js'

// Taker label for TakeAG = the player's (translated) general name, else their
// screen name, else "P<id>" (RoomLogic.js TakeAG uses Lua.tr(photo.general)).
function takerNameFor(pid: number): string {
  const p = useGameStore.getState().players[pid]
  if (!p) return `P${pid}`
  return p.general ? tr(p.general) : (p.name || `P${pid}`)
}

export type PopupKind = 'general' | 'choice' | 'choices' | 'cards' | 'ag' | 'arrange' | 'poxi' | 'cardsAndChoice' | 'moveBoard' | 'chooseSkill' | 'unsupported'

export interface CardGroup { name: string; cards: { cid: number; known: boolean }[] }
export interface ArrangeArea { name: string; capacity: number; limit: number }

export interface PopupRequest {
  kind: PopupKind
  prompt: string
  // general: list of general names, choose `count`
  generals?: string[]
  count?: number
  // general: rule_type + extra_data drive the VM's chooseGeneral{Filter,Feasible,
  // Prompt} (ChooseGeneralBox.qml); convertDisabled hides the convert button.
  ruleType?: string
  extraData?: unknown
  hegemony?: boolean
  convertDisabled?: boolean
  // choice/choices: display options + the raw values to reply with (parallel arrays)
  options?: string[]
  values?: string[]
  min?: number
  max?: number
  cancelable?: boolean
  // cards (AskForCardChosen/CardsChosen): grouped cards; pick min..max (1 if single)
  groups?: CardGroup[]
  // ag (AskForAG): the pile of cards; taken ones stay (greyed) with the taker name
  // (AG.qml takeAG marks selectable=false + footnote, it does NOT remove the card).
  // agInteractive mirrors manualBox.item.interactive (RoomLogic.js:1462): the pile is
  // laid out by FillAG but only becomes clickable once AskForAG arrives for THIS
  // player (otherwise watching others pick would reply with a stale requestId).
  agCards?: { cid: number; takenBy?: string }[]
  agInteractive?: boolean
  // arrange (Guanxing/Exchange/ArrangeCards → ArrangeCardsBox/GuanxingBox.qml):
  // assign cards into ordered areas; reply [[cids per area]]. initialSlots pre-
  // places cards into their source areas (QML initializeCards), so "do nothing"
  // keeps the dealt order (critical for Guanxing). isFree=false locks area-0's
  // original cards' relative order; pattern restricts which cards may enter a
  // pattern-gated area (here: only cards matching the pattern are draggable at all,
  // mirroring GuanxingBox cardFitPattern). arrangeCancelable shows a Cancel button.
  arrangeCards?: number[]
  areas?: ArrangeArea[]
  initialSlots?: number[][]
  isFree?: boolean
  arrangeCancelable?: boolean
  arrangePattern?: string
  // poxi (AskForPoxi → PoxiBox.qml): real selection rules live in the VM's
  // Fk.poxi_methods[poxiType] (card_filter/feasible/prompt). The component drives
  // selectability + OK through vm.poxi{Filter,Feasible,Prompt} instead of a
  // min..max downgrade. cardData/poxiExtra are the raw request payload passed back.
  poxiType?: string
  poxiData?: unknown
  poxiExtra?: unknown
  // cardsAndChoice (AskForCardsAndChoice → ChooseCardsAndChoiceBox.qml): pick
  // min..max cards (some disabled), then choose an OK option. ok option `i>0` is
  // gated by the VM's filter_skel.choiceFilter(cards, choice, extra). cancel options
  // always reply with empty cards. Reply = { cards:[cid], choice }.
  ccCards?: number[]
  ccDisabled?: number[]
  ccOkOptions?: string[]
  ccCancelOptions?: string[]
  ccFilterSkel?: string
  ccExtra?: unknown
  // moveBoard (AskForMoveCardInBoard → MoveCardInBoardBox.qml): two sides
  // (generalNames[0]/[1]); each card sits on side cardsPosition[i] (0/1). Picking a
  // card "moves" it to the other side; reply { cardId, pos } where pos is the card's
  // ORIGINAL position (room.lua:2990 uses pos to decide from/to). Single selection.
  mbCards?: number[]
  mbPositions?: number[]
  mbSideNames?: string[]
  mbPlayerIds?: number[]
  mbVirtNames?: Record<string, string>
  // chooseSkill (CustomDialog → utility/qml/ChooseSkillBox.qml, used by sp xiaode etc.):
  // pick min..max skills from a list; reply the selected skill-name array (or "" via
  // cancel). csGenerals (optional, parallel) shows each skill's source general avatar.
  csSkills?: string[]
  csGenerals?: string[]
}

interface PopupState {
  active: PopupRequest | null
  /** Sends a reply through the gateway; injected by connectionStore. */
  replySender?: (data: unknown) => void
  /** Handle an incoming notifyUI for a popup-style request. Returns true if handled. */
  handle: (command: string, data: unknown) => boolean
  /** Localize the active popup's prompt in place (vmStore runs processPrompt after
   *  handle(), mirroring RoomLogic.js which processPrompt()s every box prompt). */
  setActivePrompt: (prompt: string) => void
  /** Player resolved the popup → reply to server + close. */
  resolve: (value: unknown) => void
  clear: () => void
  /** Close everything EXCEPT an active AG box (which only CloseAG closes). */
  clearExceptAg: () => void
  /** AG pick: reply cid, keep the box open + locked until CloseAG (AG.qml). */
  resolveAg: (cid: number) => void
  setReplySender: (fn: (data: unknown) => void) => void
}

// Parse card_data [[name, [cids]]] groups (AskForCardChosen/CardsChosen). Each
// card's `known` (face-up) comes from visible_data[cid] — a card is hidden (back)
// when visible_data[cid] === false (PlayerCardBox.qml: known = vd[cid] != false).
// This is why e.g. Snatch/Dismantlement show the target's HAND as backs (you pick
// blind) while equip/judge are face-up.
function parseGroups(cardData: unknown, visibleData: Record<string, unknown>): CardGroup[] {
  if (!Array.isArray(cardData)) return []
  return cardData.map((g) => {
    const arr = g as [string, number[]]
    return {
      name: String(arr[0]),
      cards: (arr[1] ?? []).map((cid) => ({ cid, known: visibleData[String(cid)] !== false })),
    }
  })
}

// Initial-slot reply for arrange popups is built per-area; no flattening helper
// is needed now that the 2D card_map is preserved (initialSlots).


// PlayerCardBox.qml shuffleInvisibleOutput (anti-cheat, single pick only): when
// the clicked card is face-down (invisible) you must not reveal WHICH back you
// picked — reply a RANDOM card from the SAME area's invisible set instead. Walk
// areas in order; the first area whose invisible set contains `cid` decides
// (mirrors the QML per-area loop with early return). A visible click is in no
// area's invisible set, so it falls through and replies the actual cid.
export function shuffleInvisibleOutput(groups: CardGroup[], cid: number, rng: () => number = Math.random): number {
  for (const g of groups) {
    const invisible = g.cards.filter((c) => !c.known).map((c) => c.cid)
    if (invisible.includes(cid)) {
      return invisible[Math.floor(rng() * invisible.length)] ?? cid
    }
  }
  return cid
}

// PoxiBox.qml shuffleInvisibleOutput (lines 206-233): the MULTI-select variant.
// For each area, count how many SELECTED cids are invisible there, then replace
// them with that many DISTINCT random invisible cids from the same area (splice =
// no repeats). Visible selections pass through unchanged. Preserves position in the
// output array (only the value at each chosen-invisible slot is randomized).
export function shuffleInvisiblePoxi(groups: CardGroup[], selected: number[], rng: () => number = Math.random): number[] {
  const output = selected.slice()
  for (const g of groups) {
    const invisible = g.cards.filter((c) => !c.known).map((c) => c.cid)
    // indices in `output` that point at an invisible card of THIS area
    const chosenSlots = output.map((cid, i) => (invisible.includes(cid) ? i : -1)).filter((i) => i >= 0)
    if (chosenSlots.length === 0) continue
    const pool = [...invisible]
    for (const slot of chosenSlots) {
      const k = Math.floor(rng() * pool.length)
      const newCid = pool.splice(k, 1)[0]
      if (newCid !== undefined) output[slot] = newCid
    }
  }
  return output
}

export const usePopupStore = create<PopupState>((set, get) => ({
  active: null,

  handle: (command, data) => {
    const arr = Array.isArray(data) ? data : null
    const obj = (data && typeof data === 'object' && !Array.isArray(data)) ? (data as Record<string, unknown>) : null
    switch (command) {
      case 'AskForGeneral': {
        // [generals[], n, no_convert, heg, rule, extra_data]
        if (!arr) return false
        const heg = !!arr[3]
        const rule = (arr[4] as string) || (heg ? 'heg_general_choose' : 'askForGeneralsChosen')
        set({ active: {
          kind: 'general', prompt: '请选择武将', generals: arr[0] as string[], count: Number(arr[1]) || 1,
          ruleType: rule, extraData: arr[5] ?? { n: Number(arr[1]) || 1 }, hegemony: heg, convertDisabled: !!arr[2],
        } })
        return true
      }
      case 'AskForChoice': {
        // [choices(display)[], all_choices(values)[], skill, prompt, detailed]
        if (!arr) return false
        set({ active: { kind: 'choice', prompt: String(arr[3] || arr[2] || '请选择'), options: arr[0] as string[], values: arr[1] as string[] } })
        return true
      }
      case 'AskForChoices': {
        // [choices[], all_choices[], [min,max], cancelable, skill, prompt, detailed]
        if (!arr) return false
        const range = (arr[2] as number[]) ?? [1, 1]
        set({ active: { kind: 'choices', prompt: String(arr[5] || arr[4] || '请选择'), options: arr[0] as string[], values: arr[1] as string[], min: range[0] ?? 1, max: range[1] ?? 1, cancelable: !!arr[3] } })
        return true
      }
      case 'AskForCardChosen': {
        // { _reason, _prompt, _id, card_data: [[name,[cids]]], visible_data }
        if (!obj) return false
        const vd = (obj.visible_data as Record<string, unknown>) ?? {}
        set({ active: { kind: 'cards', prompt: String(obj._prompt || obj._reason || '请选择一张牌'), groups: parseGroups(obj.card_data, vd), min: 1, max: 1 } })
        return true
      }
      case 'AskForCardsChosen': {
        // { _reason, _prompt, _id, _min, _max, card_data, visible_data }
        if (!obj) return false
        const vdc = (obj.visible_data as Record<string, unknown>) ?? {}
        set({ active: { kind: 'cards', prompt: String(obj._prompt || obj._reason || '请选择牌'), groups: parseGroups(obj.card_data, vdc), min: Number(obj._min) || 0, max: Number(obj._max) || 1 } })
        return true
      }
      case 'FillAG': {
        // [id_list, disable_ids] — lay out the AG pile (RoomLogic.js:1453 addIds).
        // Does NOT by itself prompt; the box is non-interactive until AskForAG. But if
        // an AG box is ALREADY interactive (our AskForAG arrived first, or a re-fill
        // mid-pick), DON'T downgrade it back to the waiting state (that left the title
        // stuck on "等待…").
        if (!arr) return false
        const cids = (arr[0] as number[]) ?? []
        set((s) => {
          if (s.active?.kind === 'ag' && s.active.agInteractive) {
            // keep interactivity + prompt; just refresh the card list if it grew
            return { active: { ...s.active, agCards: cids.map((cid) => ({ cid })) } }
          }
          return { active: { kind: 'ag', prompt: '等待其他角色选择…', agCards: cids.map((cid) => ({ cid })), agInteractive: false } }
        })
        return true
      }
      case 'AskForAG': {
        // [id_list, cancelable, reason] (room.lua askToAG:2738). Activate the AG pile
        // for THIS player to pick (RoomLogic.js:1460 manualBox.interactive=true). The
        // `reason` is the skill name (e.g. "amazing_grace_skill" → 五谷丰登); show it
        // as the prompt so the player knows what they're choosing for (the QML AG box
        // title is generic "请选择一张卡牌"; we surface the skill for clarity).
        // ROBUSTNESS: AskForAG carries its OWN id_list, so if no AG box exists yet
        // (FillAG was dropped/lost, or the box got replaced), BUILD it from this data.
        const askIds = (arr?.[0] as number[]) ?? []
        const reason = String(arr?.[2] ?? '')
        // Set the prompt to the bare reason KEY (e.g. "amazing_grace_skill"); vmStore's
        // setActivePrompt(localizePrompt) registers + translates it via the VM → 五谷丰登.
        // Falls back to a generic action label when there's no reason.
        const agPrompt = reason || '请选择一张牌'
        set((s) => {
          if (s.active?.kind === 'ag') {
            return { active: { ...s.active, prompt: agPrompt, agInteractive: true } }
          }
          if (askIds.length > 0) {
            return { active: { kind: 'ag', prompt: agPrompt, agCards: askIds.map((cid) => ({ cid })), agInteractive: true } }
          }
          return {}
        })
        return true
      }
      case 'TakeAG': {
        // [pid, cid, ...] — someone took a card; KEEP it (greyed) and tag the taker
        // (AG.qml takeAG: footnote=taker, selectable=false; does NOT remove it).
        if (!arr) return false
        const takerId = Number(arr[0])
        const cid = Number(arr[1])
        const takerName = takerNameFor(takerId)
        set((s) => (s.active?.kind === 'ag'
          ? { active: { ...s.active, agCards: (s.active.agCards ?? []).map((c) => c.cid === cid ? { ...c, takenBy: takerName } : c) } }
          : {}))
        return true
      }
      case 'CloseAG': {
        set((s) => (s.active?.kind === 'ag' ? { active: null } : {}))
        return true
      }
      case 'AskForGuanxing': {
        // { cards:[[top],[bottom]], min/max_top_cards, min/max_bottom_cards,
        //   top/bottom_area_name, is_free, prompt } — cards is a 2D card_map already
        //   split into top/bottom (room.lua:1811-1817). Pre-place per that map.
        if (!obj) return false
        const map = (Array.isArray(obj.cards) ? obj.cards : []) as number[][]
        const maxTop = Number(obj.max_top_cards) || 0
        const maxBottom = Number(obj.max_bottom_cards) || 0
        const areas: ArrangeArea[] = []
        if (maxTop > 0) areas.push({ name: String(obj.top_area_name || '顶部'), capacity: maxTop, limit: Number(obj.min_top_cards) || 0 })
        if (maxBottom > 0) areas.push({ name: String(obj.bottom_area_name || '底部'), capacity: maxBottom, limit: Number(obj.min_bottom_cards) || 0 })
        // card_map row i → area i. Guard against extra rows (shouldn't happen).
        const initialSlots = areas.map((_, i) => (Array.isArray(map[i]) ? map[i]!.map(Number) : []))
        set({ active: {
          kind: 'arrange', prompt: String(obj.prompt || '请安排牌'),
          arrangeCards: initialSlots.flat(), areas, initialSlots,
          isFree: obj.is_free !== false, arrangeCancelable: !!obj.cancelable,
        } })
        return true
      }
      case 'AskForExchange': {
        // { piles:[[cids]], piles_name:[names] } — each non-empty pile is an area;
        // cards start pre-placed in their pile (initializeCards).
        if (!obj) return false
        const piles = (obj.piles as number[][]) ?? []
        const areas: ArrangeArea[] = []
        const initialSlots: number[][] = []
        piles.forEach((ids, i) => {
          if (ids.length > 0) {
            areas.push({ name: String((obj.piles_name as string[])?.[i] || `区${i}`), capacity: ids.length, limit: 0 })
            initialSlots.push(ids.map(Number))
          }
        })
        set({ active: {
          kind: 'arrange', prompt: '请交换/安排牌',
          arrangeCards: initialSlots.flat(), areas, initialSlots,
          isFree: obj.is_free !== false, arrangeCancelable: !!obj.cancelable,
        } })
        return true
      }
      case 'AskForArrangeCards': {
        // { cards:[[cid per area]], prompt, capacities, limits, names, is_free, ... }
        // cards is a 2D cardMap pre-grouped by area (room.lua:1714); pre-place it.
        if (!obj) return false
        const map = (Array.isArray(obj.cards) ? obj.cards : []) as number[][]
        const caps = (obj.capacities as number[]) ?? []
        const lims = (obj.limits as number[]) ?? []
        const names = (obj.names as string[]) ?? []
        const areas: ArrangeArea[] = caps.map((c, i) => ({ name: String(names[i] || `区${i}`), capacity: c, limit: lims[i] ?? 0 }))
        const initialSlots = areas.map((_, i) => (Array.isArray(map[i]) ? map[i]!.map(Number) : []))
        set({ active: {
          kind: 'arrange', prompt: String(obj.prompt || '请安排牌'),
          arrangeCards: initialSlots.flat(), areas, initialSlots,
          isFree: obj.is_free !== false, arrangeCancelable: !!obj.cancelable,
          arrangePattern: typeof obj.pattern === 'string' ? obj.pattern : undefined,
        } })
        return true
      }
      case 'AskForPoxi': {
        // { type, data:[[name,[cids]]], extra_data, cancelable } — PoxiBox.qml.
        // Real selection rules come from the VM's Fk.poxi_methods[type]; the PoxiBox
        // component calls vm.poxi{Filter,Feasible,Prompt} per RoomLogic.js:1077 +
        // PoxiBox.qml (selectable = poxiFilter, OK = poxiFeasible). We keep the raw
        // data/extra_data so those bridge calls match the QML signatures exactly.
        if (!obj) return false
        const groups = parseGroups(obj.data, (obj.extra_data as { visible_data?: Record<string, unknown> })?.visible_data ?? {})
        set({ active: {
          kind: 'poxi',
          prompt: '请选择牌',
          groups,
          poxiType: String(obj.type ?? ''),
          poxiData: obj.data,
          poxiExtra: obj.extra_data,
          cancelable: !!obj.cancelable,
        } })
        return true
      }
      case 'AskForCardsAndChoice': {
        // { cards:[cid], choices:[ok], prompt, cancel_choices:[cancel], min, max,
        //   filter_skel, disabled:[cid], extra_data } — ChooseCardsAndChoiceBox.qml.
        // Reply { cards:[cid], choice }. Per-choice gating via VM choiceFilter.
        if (!obj) return false
        const cards = (obj.cards as number[]) ?? []
        set({ active: {
          kind: 'cardsAndChoice',
          prompt: String(obj.prompt || '请选择牌与选项'),
          ccCards: cards,
          ccDisabled: (obj.disabled as number[]) ?? [],
          ccOkOptions: (obj.choices as string[]) ?? [],
          ccCancelOptions: (obj.cancel_choices as string[]) ?? [],
          ccFilterSkel: String(obj.filter_skel || ''),
          ccExtra: obj.extra_data,
          min: Number(obj.min) || 1,
          max: Number(obj.max) || 1,
        } })
        return true
      }
      case 'AskForMoveCardInBoard': {
        // { cards:[cid], cardsPosition:[0|1], generalNames:[s0,s1], playerIds:[id0,id1] }
        // — MoveCardInBoardBox.qml. Pick one card to move to the opposite side; reply
        // { cardId, pos } with pos = the card's ORIGINAL position (room.lua:2990).
        if (!obj) return false
        set({ active: {
          kind: 'moveBoard',
          prompt: '点击移动卡牌',
          mbCards: (obj.cards as number[]) ?? [],
          mbPositions: (obj.cardsPosition as number[]) ?? [],
          mbSideNames: (obj.generalNames as string[]) ?? [],
          mbPlayerIds: (obj.playerIds as number[]) ?? [],
        } })
        return true
      }
      case 'CustomDialog':
      case 'MiniGame': {
        // CustomDialog loads extension QML (RoomLogic.js:1478: popupBox.source =
        // AppPath + path; item.loadData(data)). We can't run arbitrary QML, but the
        // utility/qml shared boxes are a bounded, portable set (M5-b). Dispatch the
        // ported ones by qml_path; everything else falls back to the unsupported
        // popup (cancels safely). data = { path, data } (RoomLogic.js:1479-1480).
        if (command === 'CustomDialog') {
          const obj2 = (data ?? {}) as { path?: string; data?: unknown }
          const path = String(obj2.path ?? '')
          if (path.endsWith('ChooseSkillBox.qml')) {
            // loadData([skills, min, max, prompt, generals]) (ChooseSkillBox.qml:124).
            const d = (obj2.data as unknown[]) ?? []
            const skills = (d[0] as string[]) ?? []
            const min = Number(d[1] ?? 0) || 0
            const max = Number(d[2] ?? skills.length) || skills.length
            set({ active: {
              kind: 'chooseSkill',
              prompt: String(d[3] || '请选择技能'),
              csSkills: skills,
              csGenerals: Array.isArray(d[4]) ? (d[4] as string[]) : undefined,
              min, max,
              // ChooseSkillBox OK always replies (min may be 0); no separate cancel.
              cancelable: min === 0,
            } })
            return true
          }
        }
        // Unsupported extension QML / MiniGame: minimal popup whose only action
        // cancels (replies __cancel) so the operation timer doesn't stall.
        set({ active: { kind: 'unsupported', prompt: `本功能(扩展 ${command})暂不支持,已跳过`, cancelable: true } })
        return true
      }
      case 'EmptyRequest':
        // No UI — the player acts via the normal play UI; nothing to render.
        return true
      // NOTE: AskForSkillInvoke is NOT a popup — it's a ui_emu request (ReqInvoke =
      // OKScene). The OK/Cancel buttons are rendered by InteractionBar via
      // UpdateRequestUI; its prompt arrives separately. Handled there, not here.
      default:
        return false
    }
  },

  resolve: (value) => {
    get().replySender?.(value)
    set({ active: null })
    useTimerStore.getState().deactivate() // popup answered → state="notactive"
  },

  clear: () => set({ active: null }),
  // CancelRequest just sets state="notactive" (RoomLogic.js:1221); it does NOT close
  // the AG box. AG lives in the separate persistent `manualBox`, closed only by
  // CloseAG (RoomLogic.js:1476). The VM emits notifyUI("CancelRequest") before EVERY
  // AskFor* command (client.lua:48-49) — including the AskForAG that follows FillAG —
  // so a blanket clear() here would wipe the AG pile right before AskForAG only
  // *mutates* it, leaving nothing to show. Preserve an active AG popup across cancel.
  clearExceptAg: () => set((s) => (s.active?.kind === 'ag' ? {} : { active: null })),

  resolveAg: (cid) => {
    // AG pick (AG.qml onClicked:39-44): reply the cid, become non-interactive, but
    // KEEP the box open — the subsequent TakeAG tags the taken card and the box only
    // closes on CloseAG. resolve() (which nulls active) would hide the pile too early.
    get().replySender?.(cid)
    set((s) => (s.active?.kind === 'ag' ? { active: { ...s.active, agInteractive: false, prompt: '等待…' } } : {}))
    useTimerStore.getState().deactivate()
  },
  setReplySender: (fn) => set({ replySender: fn }),
  setActivePrompt: (prompt) => set((s) => (s.active ? { active: { ...s.active, prompt } } : {})),
}))
