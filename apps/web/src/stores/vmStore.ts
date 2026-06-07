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
import { useCardFaceStore } from './cardFaceStore.js'
import { useInteractionStore } from './interactionStore.js'
import { usePopupStore } from './popupStore.js'
import { useLogStore } from './logStore.js'
import { useTimerStore } from './timerStore.js'
import { registerTranslations, hasTranslation } from '../i18n/zh.js'

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
        else if (e.command === 'DestroyTableCard') useCardStore.getState().destroyTableCards((e.data as number[]) ?? [])
        else if (e.command === 'DestroyTableCardByEvent') useCardStore.getState().destroyTableCardsByEvent(Number(e.data) || 0)
        else if (e.command === 'UpdateRequestUI') useInteractionStore.getState().applyChange(e.data)
        else if (e.command === 'AskForSkillInvoke') {
          // ui_emu request (ReqInvoke OK/Cancel via UpdateRequestUI); this notify
          // only carries the prompt [skill, prompt]. Inject it into the bar.
          const d = e.data as unknown[]
          useInteractionStore.getState().setPrompt(String(d?.[1] || ''))
        }
        else if (e.command === 'ReplyToServer') {
          // The request finished in the VM; send the reply to asio. The gateway
          // stamps the correct requestId (see asio-client/ws-bridge).
          get().serverReply?.(e.data)
          useInteractionStore.getState().clear()
          useTimerStore.getState().stop()
        }
        else if (e.command === 'CancelRequest') { useInteractionStore.getState().clear(); usePopupStore.getState().clear(); useTimerStore.getState().stop() }
        else if (e.command === 'GetPlayerHandcards') {
          // Auto-reply with self's hand card ids (RoomLogic.js:1576) — no UI.
          const self = useGameStore.getState().selfId
          const hand = self !== undefined ? (useCardStore.getState().areas[`hand:${self}`] ?? []) : []
          get().serverReply?.(hand)
        }
        else if (e.command === 'GameLog') useLogStore.getState().push(String(e.data ?? ''))
        else if (e.command === 'ShowToast') useLogStore.getState().showToast(String(e.data ?? ''))
        // Popup-style requests (AskForGeneral/Choice/cards/AG/arrange) — not ui_emu.
        else if (usePopupStore.getState().handle(e.command, e.data)) {
          const active = usePopupStore.getState().active
          if (active) {
            // Translate any general/option keys the popup will display.
            const keys = [...(active.generals ?? []), ...(active.options ?? [])].filter((k) => !hasTranslation(k))
            if (keys.length > 0) registerTranslations(get().vm!.translate(keys))
            // Fetch general info (extension + kingdom) for AskForGeneral candidates
            // — they aren't players yet, so feed()'s readGenerals won't cover them.
            // GeneralCardItem.qml needs kingdom for the faction frame/icon (GEN1/2).
            const cachedGen = useCardFaceStore.getState().generals
            const needGen = (active.generals ?? []).filter((n) => !cachedGen[n])
            if (needGen.length > 0) useCardFaceStore.getState().mergeGenerals(get().vm!.readGenerals(needGen))
            // Fetch faces for popup cards (AG / card-pick / arrange) — these cids
            // aren't in cardStore areas, so feed()'s face fetch won't cover them.
            const cardCids = [
              ...(active.agCards ?? []),
              ...(active.arrangeCards ?? []),
              ...((active.groups ?? []).flatMap((g) => g.cards.map((c) => c.cid))),
            ]
            const cached = useCardFaceStore.getState().faces
            const need = cardCids.filter((c) => c > 0 && !cached[c])
            if (need.length > 0) useCardFaceStore.getState().merge(get().vm!.readCards(need))
          }
        }
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
    // A server request starts the operation countdown (Room.qml notactive→active):
    // total = timeout*1000, elapsed measured from the server timestamp.
    if (isRequest) {
      const r = env as RequestEnvelope
      useTimerStore.getState().start(r.timeout, r.timestamp)
    }
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
      useGameStore.getState().setSelfSkills(vm.readSkills())
    } catch (err) {
      console.error('[vm] readPlayers threw:', err)
    }
    // Fetch faces for any cards now present that we haven't cached (faces are
    // static per cid). Covers card areas + players' equip/judge cards.
    try {
      const cached = useCardFaceStore.getState().faces
      const cids = new Set<number>()
      for (const ids of Object.values(useCardStore.getState().areas)) {
        for (const cid of ids) if (cid > 0 && !cached[cid]) cids.add(cid)
      }
      for (const p of Object.values(useGameStore.getState().players)) {
        for (const cid of [...(p.equipCids ?? []), ...(p.judgeCids ?? [])]) {
          if (cid > 0 && !cached[cid]) cids.add(cid)
        }
      }
      if (cids.size > 0) useCardFaceStore.getState().merge(vm.readCards([...cids]))
    } catch (err) {
      console.error('[vm] readCards threw:', err)
    }
    // Fetch general extensions (for portrait paths) for any uncached generals.
    try {
      const cachedGen = useCardFaceStore.getState().generals
      const names = new Set<string>()
      for (const p of Object.values(useGameStore.getState().players)) {
        if (p.general && !cachedGen[p.general]) names.add(p.general)
        if (p.deputyGeneral && !cachedGen[p.deputyGeneral]) names.add(p.deputyGeneral)
      }
      if (names.size > 0) useCardFaceStore.getState().mergeGenerals(vm.readGenerals([...names]))
    } catch (err) {
      console.error('[vm] readGenerals threw:', err)
    }
    // Translate any keys we now show but haven't localized yet (card names,
    // general names, skill names) via the VM's Fk:translate. Cache so we only
    // fetch each key once.
    try {
      const keys = new Set<string>()
      const faces = useCardFaceStore.getState().faces
      for (const f of Object.values(faces)) { if (f.name && !hasTranslation(f.name)) keys.add(f.name); if (f.virt_name && !hasTranslation(f.virt_name)) keys.add(f.virt_name) }
      for (const p of Object.values(useGameStore.getState().players)) {
        if (p.general && !hasTranslation(p.general)) keys.add(p.general)
        if (p.deputyGeneral && !hasTranslation(p.deputyGeneral)) keys.add(p.deputyGeneral)
      }
      for (const sk of useGameStore.getState().selfSkills) if (!hasTranslation(sk)) keys.add(sk)
      if (keys.size > 0) registerTranslations(vm.translate([...keys]))
    } catch (err) {
      console.error('[vm] translate threw:', err)
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
    useCardFaceStore.getState().reset()
    useInteractionStore.getState().clear()
    usePopupStore.getState().clear()
    useLogStore.getState().reset()
    set({ vm: null, booted: false, booting: false, notifyCounts: {}, recent: [], totalFed: 0, stats: undefined, error: undefined })
  },
}))
