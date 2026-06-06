// vmStore.ts — manages the client VM lifecycle and the notifyUI feed (M2 slice 1).
//
// On entering a room the gateway starts streaming room packets. We boot the VM
// once, then feed every server packet's RAW CBOR (envelope.raw) into it. The VM
// expands them and emits notifyUI deltas — which we count + sample here. The
// table UI (consuming these deltas) is the next M2 slice.

import { create } from 'zustand'
import type { Envelope, NotifyEnvelope, RequestEnvelope } from '@freekill-web/protocol'
import { base64ToBytes } from '@freekill-web/protocol'
import { ClientVm, type ClientVmStats, type NotifyEvent } from '../vm/clientVm.js'
import { useGameStore } from './gameStore.js'

interface VmState {
  vm: ClientVm | null
  booting: boolean
  booted: boolean
  error?: string
  stats?: ClientVmStats
  /** notifyUI command -> count */
  notifyCounts: Record<string, number>
  /** most recent notifyUI events (capped) */
  recent: NotifyEvent[]
  totalFed: number
  /** Routes VM outbound (notifyServer) to the gateway; set by connectionStore. */
  serverSender?: (command: string, data: unknown) => void
  bootIfNeeded: () => Promise<void>
  feed: (env: Envelope) => Promise<void>
  setServerSender: (fn: (command: string, data: unknown) => void) => void
  reset: () => void
}

const RECENT_CAP = 50

export const useVmStore = create<VmState>((set, get) => ({
  vm: null,
  booting: false,
  booted: false,
  notifyCounts: {},
  recent: [],
  totalFed: 0,

  bootIfNeeded: async () => {
    if (get().vm || get().booting) return
    set({ booting: true, error: undefined })
    const vm = new ClientVm(
      (e) => {
        // Drive the render cache, then update the debug feed.
        useGameStore.getState().apply(e.command, e.data)
        set((s) => ({
          notifyCounts: { ...s.notifyCounts, [e.command]: (s.notifyCounts[e.command] ?? 0) + 1 },
          recent: [e, ...s.recent].slice(0, RECENT_CAP),
        }))
      },
      // VM outbound (notifyServer, e.g. Heartbeat) → gateway → asio. Injected by
      // connectionStore to avoid a circular import. data is the JSON the VM sent.
      (m) => {
        let data: unknown = m.data
        try { data = JSON.parse(m.data) } catch { /* keep string */ }
        get().serverSender?.(m.command, data)
      },
    )
    try {
      const stats = await vm.boot()
      set({ vm, booted: true, booting: false, stats })
    } catch (err) {
      set({ booting: false, error: (err as Error).message })
    }
  },

  setServerSender: (fn) => set({ serverSender: fn }),

  feed: async (env: Envelope) => {
    const vm = get().vm
    if (!vm) return
    // Only server request/notify packets carry raw CBOR for the VM.
    const raw = (env as NotifyEnvelope | RequestEnvelope).raw
    if (!raw) return
    const isRequest = env.kind === 'request'
    await vm.feedPacket(env.command, base64ToBytes(raw), isRequest)
    set((s) => ({ totalFed: s.totalFed + 1 }))
    // Re-read the VM's authoritative player mirror (includes Self, which never
    // arrives via AddPlayer). This keeps the roster correct regardless of which
    // delta just landed.
    const players = await vm.readPlayers()
    useGameStore.getState().syncPlayers(players)
  },

  reset: () => {
    get().vm?.close()
    useGameStore.getState().resetGame()
    set({ vm: null, booted: false, booting: false, notifyCounts: {}, recent: [], totalFed: 0, stats: undefined, error: undefined })
  },
}))
