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
import { useCardStore } from './cardStore.js'
import { useInteractionStore } from './interactionStore.js'

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
  /** Routes a VM reply (ReplyToServer) to the gateway; set by connectionStore. */
  serverReply?: (data: unknown) => void
  bootIfNeeded: () => Promise<void>
  feed: (env: Envelope) => Promise<void>
  /** Drive a UI interaction into the VM (click card/target/button). */
  interact: (elemType: string, id: string | number, action: string, data: unknown) => Promise<void>
  setServerSender: (fn: (command: string, data: unknown) => void) => void
  setServerReply: (fn: (data: unknown) => void) => void
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
        // Drive the render caches, then update the debug feed.
        useGameStore.getState().apply(e.command, e.data)
        if (e.command === 'MoveCards') useCardStore.getState().applyMoveCards(e.data)
        else if (e.command === 'UpdateRequestUI') useInteractionStore.getState().applyChange(e.data)
        else if (e.command === 'ReplyToServer') {
          // The request finished in the VM; send the reply to asio. The gateway
          // stamps the correct requestId (see asio-client/ws-bridge).
          get().serverReply?.(e.data)
          useInteractionStore.getState().clear()
        }
        else if (e.command === 'CancelRequest') useInteractionStore.getState().clear()
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
    // A single bad packet must not break the feed chain (which would freeze all
    // subsequent packets). Log it and keep going; still re-sync the roster after.
    try {
      await vm.feedPacket(env.command, base64ToBytes(raw), isRequest)
      set((s) => ({ totalFed: s.totalFed + 1 }))
    } catch (err) {
      console.error(`[vm] feedPacket ${env.command} threw:`, err)
      set({ error: `feedPacket ${env.command}: ${(err as Error).message}` })
    }
    // Re-read the VM's authoritative player mirror (includes Self, which never
    // arrives via AddPlayer). This keeps the roster correct regardless of which
    // delta just landed.
    try {
      const players = await vm.readPlayers()
      useGameStore.getState().syncPlayers(players)
    } catch (err) {
      console.error('[vm] readPlayers threw:', err)
    }
  },

  interact: async (elemType, id, action, data) => {
    const vm = get().vm
    if (!vm) return
    try {
      await vm.updateRequestUI(elemType, id, action, data)
    } catch (err) {
      console.error('[vm] updateRequestUI threw:', err)
      set({ error: `updateRequestUI: ${(err as Error).message}` })
    }
  },

  setServerReply: (fn) => set({ serverReply: fn }),

  reset: () => {
    get().vm?.close()
    useGameStore.getState().resetGame()
    useCardStore.getState().reset()
    useInteractionStore.getState().clear()
    set({ vm: null, booted: false, booting: false, notifyCounts: {}, recent: [], totalFed: 0, stats: undefined, error: undefined })
  },
}))
