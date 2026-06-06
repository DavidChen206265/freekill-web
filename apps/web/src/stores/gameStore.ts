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
  return { id, name: '', avatar: '', marks: {} }
}

export const useGameStore = create<GameState>((set, get) => ({
  players: {},
  seatOrder: [],
  started: false,

  apply: (command, data) => {
    const arr = Array.isArray(data) ? data : null
    switch (command) {
      case 'Setup': {
        // [id, name, avatar, ...] — identifies self.
        if (arr) set({ selfId: Number(arr[0]) })
        break
      }
      case 'AddPlayer': {
        if (!arr) break
        const id = Number(arr[0])
        set((s) => ({
          players: {
            ...s.players,
            [id]: { ...blankPlayer(id), ...s.players[id], id, name: String(arr[1] ?? ''), avatar: String(arr[2] ?? '') },
          },
        }))
        break
      }
      case 'RemovePlayer': {
        if (!arr) break
        const id = Number(arr[0])
        set((s) => {
          const players = { ...s.players }
          delete players[id]
          return { players, seatOrder: s.seatOrder.filter((x) => x !== id) }
        })
        break
      }
      case 'ArrangeSeats': {
        if (!arr) break
        const order = arr.map(Number)
        set((s) => {
          const players = { ...s.players }
          order.forEach((id, i) => {
            players[id] = { ...blankPlayer(id), ...players[id], id, seat: i + 1 }
          })
          return { players, seatOrder: order }
        })
        break
      }
      case 'PropertyUpdate': {
        if (!arr) break
        const id = Number(arr[0])
        const prop = String(arr[1])
        const value = arr[2]
        set((s) => {
          const prev = s.players[id] ?? blankPlayer(id)
          return { players: { ...s.players, [id]: { ...prev, [prop]: value } } }
        })
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
      // Preserve seat order by seat number when present, else insertion.
      const ordered = Object.values(players)
        .sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
        .map((p) => p.id)
      return { players, selfId, seatOrder: ordered, started: started ?? s.started }
    })
  },
}))
