// gameStore.ts — normalized game state, fed by the VM's notifyUI deltas. No game
// logic here (the VM owns rules); this is just a render cache. Fields come
// straight from notifyUI payloads (array-form, confirmed from clientbase.lua):
//   AddPlayer      [id, name, avatar, ready, time]
//   RemovePlayer   [id]
//   ArrangeSeats   [id1, id2, ...]   (index+1 = seat)
//   PropertyUpdate [id, propertyName, value]   (hp/maxHp/general/role/kingdom/...)
//   SetPlayerMark  [id, mark, value]
//   StartGame      []

import { create } from 'zustand'
import type { SkillInfo } from '../vm/clientVm.js'

export interface GamePlayer {
  id: number
  name: string
  avatar: string
  /** Display slot (0 = self at bottom). Append order until ArrangeSeats rotates it. */
  index: number
  seat?: number
  general?: string
  deputyGeneral?: string
  hp?: number
  maxHp?: number
  shield?: number
  role?: string
  kingdom?: string
  dead?: boolean
  ready?: boolean
  owner?: boolean
  chained?: boolean
  dying?: boolean
  role_shown?: boolean
  roleVisible?: boolean
  faceup?: boolean
  sealedSlots?: string[]
  /** Card ids in this player's equip / judge areas (rendered inside the Photo). */
  equipCids?: number[]
  judgeCids?: number[]
  handcardNum?: number
  /** Text marks (Photo MarkArea): name is ALREADY translated; value is the localized
   *  suffix ("" when hidden via @@). Rendered as `name value`. */
  displayMarks?: { name: string; value: string }[]
  /** Picture marks (Photo PicMarkArea, @!): name = raw mark key (→ getMarkPic icon),
   *  value = count/localized text overlay, extra = hover tooltip (@!! description). */
  picMarks?: { name: string; value: string; extra: string }[]
  marks: Record<string, number>
}

interface GameState {
  players: Record<number, GamePlayer>
  seatOrder: number[]
  started: boolean
  capacity: number
  selfId?: number
  /** True when watching as an observer (entered via ObserveRoom). Observers can
   *  switch viewpoint (changeSelf) and never receive interaction requests. */
  observing: boolean
  /** Self's visible skills with classification (from VM GetMySkills+GetSkillData). */
  selfSkills: SkillInfo[]
  /** GameOver winner roles (+-joined), set when the game ends; '' = draw. */
  winner?: string
  apply: (command: string, data: unknown) => void
  /** Replace player state from the VM's authoritative mirror (includes Self). */
  syncPlayers: (players: VmPlayerLike[], started?: boolean) => void
  setSelfSkills: (skills: SkillInfo[]) => void
  setObserving: (observing: boolean) => void
  resetGame: () => void
  /** Back-to-room after GameOver: clear game flags + winner but KEEP the roster,
   *  set the (post-ResetClientLua) capacity so WaitingRoom can render seats. */
  backToRoom: (capacity: number) => void
}

export interface VmPlayerLike {
  id: number
  name: string
  avatar: string
  seat?: number
  general?: string
  deputyGeneral?: string
  hp?: number
  maxHp?: number
  role?: string
  kingdom?: string
  dead?: boolean
  ready?: boolean
  owner?: boolean
  shield?: number
  chained?: boolean
  dying?: boolean
  role_shown?: boolean
  roleVisible?: boolean
  faceup?: boolean
  sealedSlots?: string[]
  equipCids?: number[]
  judgeCids?: number[]
  handcardNum?: number
  marks?: { name: string; value: string }[]
  picMarks?: { name: string; value: string; extra: string }[]
  isSelf?: boolean
}

function blankPlayer(id: number): GamePlayer {
  return { id, name: '', avatar: '', index: 0, marks: {} }
}

// Recompute display `index` for all players (RoomLogic.js arrangeSeats:733-750):
// rotate the seat order so Self is first (index 0 = bottom), others follow. Used
// after ArrangeSeats. `order` is the seat-ordered id list; selfId goes to slot 0.
function rotateToSelf(order: number[], selfId: number | undefined): Map<number, number> {
  const idx = new Map<number, number>()
  if (order.length === 0) return idx
  const selfPos = selfId !== undefined ? order.indexOf(selfId) : -1
  const rotated = selfPos >= 0 ? [...order.slice(selfPos), ...order.slice(0, selfPos)] : order
  rotated.forEach((id, i) => idx.set(id, i))
  return idx
}

export const useGameStore = create<GameState>((set, get) => ({
  players: {},
  seatOrder: [],
  started: false,
  capacity: 0,
  observing: false,
  selfSkills: [],

  // The ROSTER (players/seat/general/hp/...) is owned by syncPlayers, which reads
  // the VM's authoritative mirror after every packet. apply() only handles deltas
  // that aren't part of the player mirror read: selfId, marks, started.
  apply: (command, data) => {
    const arr = Array.isArray(data) ? data : null
    switch (command) {
      case 'Setup': {
        // [id, name, avatar, ...] — identifies self.
        if (arr) set({ selfId: Number(arr[0]) })
        break
      }
      case 'EnterRoom': {
        // [capacity, timeout, settings] — room capacity for isFull/waiting room.
        if (arr) set({ capacity: Number(arr[0]) || 0 })
        break
      }
      case 'SetPlayerMark': {
        if (!arr) break
        const id = Number(arr[0])
        const mark = String(arr[1])
        const value = Number(arr[2])
        set((s) => {
          const prev = s.players[id] ?? blankPlayer(id)
          return { players: { ...s.players, [id]: { ...prev, marks: { ...prev.marks, [mark]: value } } } }
        })
        break
      }
      case 'StartGame': {
        set({ started: true, winner: undefined })
        break
      }
      case 'GameOver': {
        // data = winner role string ('+'-joined); '' = draw.
        set({ winner: typeof data === 'string' ? data : String(data ?? '') })
        break
      }
      default:
        break
    }
  },

  setSelfSkills: (skills) => set({ selfSkills: skills }),
  setObserving: (observing) => set({ observing }),

  resetGame: () => set({ players: {}, seatOrder: [], started: false, capacity: 0, observing: false, selfSkills: [], winner: undefined, selfId: get().selfId }),

  // Back to waiting room: drop the game-over banner + started flag and reset the
  // in-game roster props, but DON'T wipe players (the caller re-syncs them from the
  // VM's post-ResetClientLua mirror). Capacity comes from ResetClientLua so the
  // seat grid + owner/start controls reappear (issue: controls vanished on return).
  backToRoom: (capacity) => set({ started: false, winner: undefined, capacity, seatOrder: [], selfSkills: [] }),

  syncPlayers: (vmPlayers, started) => {
    set((s) => {
      const players: Record<number, GamePlayer> = {}
      let selfId = s.selfId
      for (const vp of vmPlayers) {
        const prev = s.players[vp.id] ?? blankPlayer(vp.id)
        players[vp.id] = {
          ...prev,
          id: vp.id,
          name: vp.name || prev.name,
          avatar: vp.avatar || prev.avatar,
          seat: vp.seat ?? prev.seat,
          general: vp.general ?? prev.general,
          deputyGeneral: vp.deputyGeneral ?? prev.deputyGeneral,
          hp: vp.hp ?? prev.hp,
          maxHp: vp.maxHp ?? prev.maxHp,
          shield: vp.shield ?? prev.shield,
          role: vp.role ?? prev.role,
          kingdom: vp.kingdom ?? prev.kingdom,
          dead: vp.dead ?? prev.dead,
          ready: vp.ready ?? prev.ready,
          owner: vp.owner ?? prev.owner,
          chained: vp.chained ?? prev.chained,
          dying: vp.dying ?? prev.dying,
          role_shown: vp.role_shown ?? prev.role_shown,
          roleVisible: vp.roleVisible ?? prev.roleVisible,
          faceup: vp.faceup ?? prev.faceup,
          sealedSlots: vp.sealedSlots ?? prev.sealedSlots,
          equipCids: vp.equipCids ?? prev.equipCids,
          judgeCids: vp.judgeCids ?? prev.judgeCids,
          handcardNum: vp.handcardNum ?? prev.handcardNum,
          displayMarks: vp.marks ?? prev.displayMarks,
          picMarks: vp.picMarks ?? prev.picMarks,
        }
        if (vp.isSelf) selfId = vp.id
      }

      // Display index (RoomLogic.js): if seats are assigned (ArrangeSeats fired),
      // order by seat then rotate Self to slot 0. Otherwise (waiting room) use the
      // VM's player order (which lists Self first — see ClientBase:setup), so Self
      // is already index 0.
      const haveSeats = vmPlayers.some((p) => p.seat && p.seat > 0)
      let idxMap: Map<number, number>
      if (haveSeats) {
        const order = [...vmPlayers].sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99)).map((p) => p.id)
        idxMap = rotateToSelf(order, selfId)
      } else {
        // Pin self to 0, others follow in VM order.
        const ids = vmPlayers.map((p) => p.id)
        const sp = selfId !== undefined ? ids.indexOf(selfId) : -1
        const ordered = sp >= 0 ? [selfId!, ...ids.filter((x) => x !== selfId)] : ids
        idxMap = new Map(ordered.map((id, i) => [id, i]))
      }
      for (const id of Object.keys(players).map(Number)) {
        players[id]!.index = idxMap.get(id) ?? 0
      }

      const seatOrder = [...Object.values(players)].sort((a, b) => a.index - b.index).map((p) => p.id)
      return { players, selfId, seatOrder, started: started ?? s.started }
    })
  },
}))
