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
  role?: string
  kingdom?: string
  dead?: boolean
  handcardNum?: number
  marks: Record<string, number>
}

interface GameState {
  players: Record<number, GamePlayer>
  seatOrder: number[]
  started: boolean
  selfId?: number
  apply: (command: string, data: unknown) => void
  /** Replace player state from the VM's authoritative mirror (includes Self). */
  syncPlayers: (players: VmPlayerLike[], started?: boolean) => void
  resetGame: () => void
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
        set({ started: true })
        break
      }
      default:
        break
    }
  },

  resetGame: () => set({ players: {}, seatOrder: [], started: false, selfId: get().selfId }),

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
          role: vp.role ?? prev.role,
          kingdom: vp.kingdom ?? prev.kingdom,
          dead: vp.dead ?? prev.dead,
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
