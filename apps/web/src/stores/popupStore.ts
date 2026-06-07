// popupStore.ts — "popup" requests that are NOT ui_emu (notify + direct reply):
// AskForGeneral (choose general — every game starts with this), AskForChoice
// (pick one option), AskForSkillInvoke (yes/no). The VM forwards these as raw
// notifyUI; the player picks in React and we reply via the gateway (requestId
// stamped by the gateway). See memory ui-emu-request-architecture (two request
// kinds). Distinct from interactionStore (UpdateRequestUI / ui_emu).

import { create } from 'zustand'
import { useTimerStore } from './timerStore.js'

export type PopupKind = 'general' | 'choice' | 'choices' | 'cards' | 'ag' | 'arrange'

export interface CardGroup { name: string; cards: { cid: number; known: boolean }[] }
export interface ArrangeArea { name: string; capacity: number; limit: number }

export interface PopupRequest {
  kind: PopupKind
  prompt: string
  // general: list of general names, choose `count`
  generals?: string[]
  count?: number
  // choice/choices: display options + the raw values to reply with (parallel arrays)
  options?: string[]
  values?: string[]
  min?: number
  max?: number
  cancelable?: boolean
  // cards (AskForCardChosen/CardsChosen): grouped cards; pick min..max (1 if single)
  groups?: CardGroup[]
  // ag (AskForAG): a flat list of card ids; pick one
  agCards?: number[]
  // arrange (Guanxing/Exchange/ArrangeCards): assign cards into areas; reply [[cids]]
  arrangeCards?: number[]
  areas?: ArrangeArea[]
}

interface PopupState {
  active: PopupRequest | null
  /** Sends a reply through the gateway; injected by connectionStore. */
  replySender?: (data: unknown) => void
  /** Handle an incoming notifyUI for a popup-style request. Returns true if handled. */
  handle: (command: string, data: unknown) => boolean
  /** Player resolved the popup → reply to server + close. */
  resolve: (value: unknown) => void
  clear: () => void
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

// Flatten cards:[[cid]] (array of piles) into a single cid list.
function flattenCards(cards: unknown): number[] {
  if (!Array.isArray(cards)) return []
  const out: number[] = []
  for (const pile of cards) if (Array.isArray(pile)) for (const cid of pile) out.push(Number(cid))
  return out
}

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

export const usePopupStore = create<PopupState>((set, get) => ({
  active: null,

  handle: (command, data) => {
    const arr = Array.isArray(data) ? data : null
    const obj = (data && typeof data === 'object' && !Array.isArray(data)) ? (data as Record<string, unknown>) : null
    switch (command) {
      case 'AskForGeneral': {
        // [generals[], n, no_convert, heg, rule, extra_data]
        if (!arr) return false
        set({ active: { kind: 'general', prompt: '请选择武将', generals: arr[0] as string[], count: Number(arr[1]) || 1 } })
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
        // [cids] — lay out the AG pile (does not by itself prompt).
        if (!arr) return false
        set({ active: { kind: 'ag', prompt: '等待…', agCards: (arr[0] as number[]) ?? [] } })
        return true
      }
      case 'AskForAG': {
        // activate the existing AG pile for THIS player to pick one.
        set((s) => ({ active: s.active?.kind === 'ag' ? { ...s.active, prompt: '请选择一张牌' } : s.active }))
        return true
      }
      case 'TakeAG': {
        // [pid, cid] — someone took a card; remove it from the pile.
        if (!arr) return false
        const cid = Number(arr[1])
        set((s) => (s.active?.kind === 'ag' ? { active: { ...s.active, agCards: (s.active.agCards ?? []).filter((c) => c !== cid) } } : {}))
        return true
      }
      case 'CloseAG': {
        set((s) => (s.active?.kind === 'ag' ? { active: null } : {}))
        return true
      }
      case 'AskForGuanxing': {
        // { cards:[[cid]], min/max_top_cards, min/max_bottom_cards, top/bottom_area_name, is_free, prompt }
        if (!obj) return false
        const cards = flattenCards(obj.cards)
        const maxTop = Number(obj.max_top_cards) || 0
        const maxBottom = Number(obj.max_bottom_cards) || 0
        const areas: ArrangeArea[] = []
        if (maxTop > 0) areas.push({ name: String(obj.top_area_name || '顶部'), capacity: maxTop, limit: Number(obj.min_top_cards) || 0 })
        if (maxBottom > 0) areas.push({ name: String(obj.bottom_area_name || '底部'), capacity: maxBottom, limit: Number(obj.min_bottom_cards) || 0 })
        set({ active: { kind: 'arrange', prompt: String(obj.prompt || '请安排牌'), arrangeCards: cards, areas } })
        return true
      }
      case 'AskForExchange': {
        // { piles:[[cids]], piles_name:[names] } — each non-empty pile is an area.
        if (!obj) return false
        const piles = (obj.piles as number[][]) ?? []
        const names = (obj.piles_name as string[]) ?? []
        const cards: number[] = []
        const areas: ArrangeArea[] = []
        piles.forEach((ids, i) => {
          if (ids.length > 0) { ids.forEach((id) => cards.push(id)); areas.push({ name: String(names[i] || `区${i}`), capacity: ids.length, limit: 0 }) }
        })
        set({ active: { kind: 'arrange', prompt: '请交换/安排牌', arrangeCards: cards, areas } })
        return true
      }
      case 'AskForArrangeCards': {
        // { cards:[[cid]], prompt, capacities, limits, names, ... }
        if (!obj) return false
        const cards = flattenCards(obj.cards)
        const caps = (obj.capacities as number[]) ?? []
        const lims = (obj.limits as number[]) ?? []
        const names = (obj.names as string[]) ?? []
        const areas: ArrangeArea[] = caps.map((c, i) => ({ name: String(names[i] || `区${i}`), capacity: c, limit: lims[i] ?? 0 }))
        set({ active: { kind: 'arrange', prompt: String(obj.prompt || '请安排牌'), arrangeCards: cards, areas } })
        return true
      }
      case 'AskForPoxi': {
        // { type, data:[[name,[cids]]], extra_data, cancelable } — selection (poxi
        // rules computed server-side); downgrade to a min0..maxAll card pick.
        if (!obj) return false
        const groups = parseGroups(obj.data, (obj.visible_data as Record<string, unknown>) ?? {})
        const total = groups.reduce((n, g) => n + g.cards.length, 0)
        set({ active: { kind: 'cards', prompt: '请选择牌(拼点/破袭)', groups, min: 0, max: total, cancelable: !!obj.cancelable } })
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
    useTimerStore.getState().stop()
  },

  clear: () => set({ active: null }),
  setReplySender: (fn) => set({ replySender: fn }),
}))
