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
import { processPrompt } from '../table/processPrompt.js'
import { useGameStore } from './gameStore.js'
import { useCardStore } from './cardStore.js'
import { useCardFaceStore } from './cardFaceStore.js'
import { useInteractionStore } from './interactionStore.js'
import { usePopupStore } from './popupStore.js'
import { useLogStore } from './logStore.js'
import { useTimerStore, TIMEOUT_SEC } from './timerStore.js'
import { useFocusStore } from './focusStore.js'
import { registerTranslations, hasTranslation, tr } from '../i18n/zh.js'

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

// The exact set of request callbacks that call roomScene.activate() in
// RoomLogic.js — i.e. every request that shows operation UI and thus (re)starts
// the operation countdown. Mirrors the activate() call sites verbatim. EmptyRequest
// is deliberately excluded (no activate); CancelRequest/reply deactivate.
const ACTIVATE_COMMANDS = new Set<string>([
  'PlayCard', 'AskForUseCard', 'AskForResponseCard', 'AskForUseActiveSkill',
  'AskForSkillInvoke', 'AskForGeneral', 'AskForChoice', 'AskForChoices',
  'AskForCardChosen', 'AskForCardsChosen', 'AskForCardsAndChoice', 'AskForPoxi',
  'AskForGuanxing', 'AskForExchange', 'AskForMoveCardInBoard', 'AskForAG',
  'CustomDialog', 'MiniGame',
])

// Translate + interpolate a prompt (RoomLogic.js processPrompt). The prompt is a
// ":"-joined "<key>:<src>:<dest>:<arg...>"; the key + arg parts are translation
// keys (numeric src/dest are player ids, not keys). Register any missing keys with
// the VM translation cache — including the helper keys getPlayerStr() consults
// (playerstr_self, seat#N) and the src/dest players' general names — then run
// processPrompt for %src/%dest/%arg substitution.
function localizePrompt(vm: ClientVm | null, prompt: string): string {
  if (!prompt) return ''
  const parts = prompt.split(':')
  const players = useGameStore.getState().players
  // The src/dest ids (parts[1], parts[2]) → their general/deputy names + seat keys.
  const playerKeys: string[] = ['playerstr_self']
  for (const idStr of [parts[1], parts[2]]) {
    const id = Number(idStr)
    if (!idStr || isNaN(id)) continue
    const p = players[id]
    if (p?.general) playerKeys.push(p.general)
    if (p?.deputyGeneral) playerKeys.push(p.deputyGeneral)
    if (p?.seat) playerKeys.push(`seat#${p.seat}`)
  }
  // key = parts[0]; parts[3+] are arg keys (numeric parts are ids/values, not keys).
  const keys = [parts[0]!, ...parts.slice(3), ...playerKeys]
    .filter((k) => k && isNaN(Number(k)) && !hasTranslation(k))
  if (vm && keys.length > 0) registerTranslations(vm.translate(keys))
  return processPrompt(prompt)
}

// Default request prompt (RoomLogic.js request callbacks: when the server sends an
// empty prompt, the bar shows Lua.tr("#AskFor…").arg(Lua.tr(arg)) — e.g.
// #AskForUseCard "请使用【%1】" with the card name, #AskForResponseCard "请打出【%1】",
// #AskForUseActiveSkill "请发动〖%1〗"). Qt's .arg() replaces %1; we register the key +
// arg with the VM translation cache then substitute. The ui_emu UpdateRequestUI
// emits an empty _prompt for these (response_card.lua original_prompt = prompt or
// ""), which the truthy guard in interactionStore drops — so this default wins,
// exactly as in QML (the request callback fires after UpdateRequestUI).
function defaultPrompt(vm: ClientVm | null, key: string, arg: string): string {
  const need = [key, arg].filter((k) => k && !hasTranslation(k))
  if (vm && need.length > 0) registerTranslations(vm.translate(need))
  return tr(key).replace(/%1/g, tr(arg))
}

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
        // Operation countdown — 1:1 with QML: every request callback that needs UI
        // calls roomScene.activate() (RoomLogic.js), which restarts the bar. The
        // ui_emu click loop (UpdateRequestUI) and non-request notifies do NOT.
        if (ACTIVATE_COMMANDS.has(e.command)) useTimerStore.getState().activate()
        if (e.command === 'MoveCards') useCardStore.getState().applyMoveCards(e.data)
        else if (e.command === 'DestroyTableCard') useCardStore.getState().destroyTableCards((e.data as number[]) ?? [])
        else if (e.command === 'DestroyTableCardByEvent') useCardStore.getState().destroyTableCardsByEvent(Number(e.data) || 0)
        else if (e.command === 'UpdateRequestUI') {
          // ui_emu request UI update (each click re-emits this). In QML this goes
          // through updateRequestUI, NOT a request callback, so it does NOT
          // activate() — the countdown is started by the request command below.
          // Translate + interpolate the prompt (RoomLogic.js processPrompt) so the
          // bar shows real text, not a "#slash_skill" key.
          const data = e.data as { _prompt?: unknown; SpecialSkills?: unknown }
          if (data && typeof data._prompt === 'string' && data._prompt) {
            data._prompt = localizePrompt(get().vm, data._prompt)
          }
          // SpecialSkills (重铸/正常使用 radio, e.g. 铁索连环 → ["_normal_use","recast"])
          // are translation keys; register them so tr() shows Chinese (Room.qml
          // RadioButton text: Lua.tr(modelData)).
          if (Array.isArray(data?.SpecialSkills) && data.SpecialSkills[0]) {
            const sk = (data.SpecialSkills[0] as { skills?: string[] }).skills
            const keys = Array.isArray(sk) ? sk.filter((k) => k && !hasTranslation(k)) : []
            if (get().vm && keys.length > 0) registerTranslations(get().vm!.translate(keys))
          }
          useInteractionStore.getState().applyChange(e.data)
        }
        else if (e.command === 'AskForSkillInvoke') {
          // ui_emu request (ReqInvoke OK/Cancel via UpdateRequestUI; invoke.lua sets
          // NO prompt). Data is [skill_name, prompt?] — for trigger skills (洛神/倾国
          // etc.) the server sends ONLY the name (verified: captured packet ["luoyi"]),
          // so prompt is empty. QML falls back to #AskForSkillInvoke "你想发动〖%1〗吗？"
          // with the skill name (RoomLogic.js:829-830). Non-empty → processPrompt.
          const d = e.data as unknown[]
          const skill = String(d?.[0] ?? '')
          const prompt = String(d?.[1] ?? '')
          useInteractionStore.getState().setPrompt(prompt ? localizePrompt(get().vm, prompt) : defaultPrompt(get().vm, '#AskForSkillInvoke', skill))
        }
        // Card/skill request commands (RoomLogic.js callbacks). These fire AFTER the
        // handler's first UpdateRequestUI, whose _prompt is empty for the no-explicit-
        // prompt case (response_card.lua original_prompt = prompt or "") — the truthy
        // guard in interactionStore drops that empty value, so the default we set here
        // wins, exactly as in QML. Non-empty server prompt → processPrompt instead.
        else if (e.command === 'PlayCard') {
          // RoomLogic.js:1172 — no data; bar shows "#PlayCard" (出牌阶段，请使用一张牌).
          useInteractionStore.getState().setPrompt(defaultPrompt(get().vm, '#PlayCard', ''))
        }
        else if (e.command === 'AskForUseCard' || e.command === 'AskForResponseCard') {
          // [cardname, pattern, prompt, …]. Empty prompt → #AskForUseCard "请使用【%1】"
          // / #AskForResponseCard "请打出【%1】" with the card name (RoomLogic.js
          // :1225-1274). %1 ← Lua.tr(cardname).
          const d = e.data as unknown[]
          const cardname = String(d?.[0] ?? '')
          const prompt = String(d?.[2] ?? '')
          const key = e.command === 'AskForUseCard' ? '#AskForUseCard' : '#AskForResponseCard'
          useInteractionStore.getState().setPrompt(prompt ? localizePrompt(get().vm, prompt) : defaultPrompt(get().vm, key, cardname))
        }
        else if (e.command === 'AskForUseActiveSkill') {
          // [skill_name, prompt, …]. Empty → #AskForUseActiveSkill "请发动〖%1〗" with
          // the skill name (RoomLogic.js:1204-1219). %1 ← Lua.tr(skill_name).
          const d = e.data as unknown[]
          const skill = String(d?.[0] ?? '')
          const prompt = String(d?.[1] ?? '')
          useInteractionStore.getState().setPrompt(prompt ? localizePrompt(get().vm, prompt) : defaultPrompt(get().vm, '#AskForUseActiveSkill', skill))
        }
        else if (e.command === 'ReplyToServer') {
          // The request finished in the VM; send the reply to asio. The gateway
          // stamps the correct requestId (see asio-client/ws-bridge). Leaving the
          // request → notactive (Room.qml finishRequestUI/reply path).
          get().serverReply?.(e.data)
          useInteractionStore.getState().clear()
          useTimerStore.getState().deactivate()
        }
        else if (e.command === 'CancelRequest') {
          // RoomLogic.js: state="notactive" (Room.qml:1221).
          useInteractionStore.getState().clear(); usePopupStore.getState().clear(); useFocusStore.getState().clear()
          useTimerStore.getState().deactivate()
        }
        else if (e.command === 'GetPlayerHandcards') {
          // Auto-reply with self's hand card ids (RoomLogic.js:1576) — no UI.
          const self = useGameStore.getState().selfId
          const hand = self !== undefined ? (useCardStore.getState().areas[`hand:${self}`] ?? []) : []
          get().serverReply?.(hand)
        }
        else if (e.command === 'GameLog') useLogStore.getState().push(String(e.data ?? ''))
        else if (e.command === 'ShowToast') useLogStore.getState().showToast(String(e.data ?? ''))
        else if (e.command === 'MoveFocus') {
          // [focuses[], command, timeout?]. Replaces the focus set (cancelAllFocus
          // then set). Photo shows a per-player thinking bar + "<command> thinking..".
          // timeout here is in MS (server sends data[2] in ms; RoomLogic.js falls
          // back to Config.roomTimeout*1000). We fall back to the active request
          // window, then the 30s default — never 0 (which would hide the bar).
          const d = e.data as unknown[]
          const ids = Array.isArray(d?.[0]) ? (d[0] as number[]).map(Number) : []
          const command = String(d?.[1] ?? '')
          // Per-Photo think bar window: use the server timeout if given, else the
          // fixed 30s (server sends data[2] in ms).
          const timeout = Number(d?.[2]) || TIMEOUT_SEC * 1000
          // Translate the command + the " thinking..." suffix (Photo.qml tip) once.
          const tkeys = [command, ' thinking...'].filter((k) => k && !hasTranslation(k))
          if (tkeys.length > 0) registerTranslations(get().vm!.translate(tkeys))
          useFocusStore.getState().setFocus(ids, command, timeout)
        }
        // Popup-style requests (AskForGeneral/Choice/cards/AG/arrange) — not ui_emu.
        else if (usePopupStore.getState().handle(e.command, e.data)) {
          const active = usePopupStore.getState().active
          if (active) {
            // Localize the popup prompt (RoomLogic.js processPrompt()s every box
            // prompt: ChoiceBox/CheckBox/PlayerCardBox titles). The VM sends a raw
            // "#key:src:dest:arg" prompt — translate + interpolate it, and render
            // any embedded <br/> as a real break (PromptText). Idempotent for the
            // already-Chinese literals some handlers set ('请选择武将' etc.).
            if (active.prompt) usePopupStore.getState().setActivePrompt(localizePrompt(get().vm, active.prompt))
            // CountdownBar starts the 30s timer off the popup-active edge (it watches
            // popupStore.active), so no explicit start here.
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
              ...(active.agCards ?? []).map((c) => c.cid),
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
    // (The operation countdown is driven by CountdownBar off the active-request
    // edge with a fixed 30s window — no per-packet timer wiring here.)
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
      // selfSkills carry their localized display name already (GetSkillData.skill =
      // Fk:getSkillName), so no extra translation pass is needed for them.
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
