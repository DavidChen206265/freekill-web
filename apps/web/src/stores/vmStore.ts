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
import { useAnimationStore } from './animationStore.js'
import { useMiscStore } from './miscStore.js'
import { useCardNoteStore } from './cardNoteStore.js'
import { playSystem, playByPath, playSkillSound, playDeath, playBgm, stopBgm, playDrawSound, playMoveSound } from '../table/audio.js'
import { registerTranslations, hasTranslation, tr } from '../i18n/zh.js'
import { log, noteNotify } from '../diag/log.js'
import { paceFor } from './pacing.js'

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
  feed: (env: Envelope) => Promise<number>
  /** Drive a UI interaction into the VM (click card/target/button). */
  interact: (elemType: string, id: string | number, action: string, data: unknown) => Promise<void>
  setServerSender: (fn: (command: string, data: unknown) => void) => void
  setServerReply: (fn: (data: unknown) => void) => void
  /** Re-read the VM player mirror into gameStore (re-rotates seats around Self). */
  refreshPlayers: () => Promise<void>
  /** Observer: switch viewpoint to player `pid` (VM changeSelf + re-sync). */
  switchViewpoint: (pid: number) => Promise<void>
  reset: () => void
  /** Back-to-room after GameOver: clear transient per-game stores, keep VM + roster. */
  resetForNewGame: () => void
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

// PACE-1 performance-beat accumulator. The VM's notifyUI callback fires SYNCHRONOUSLY
// inside vm.feedPacket(); one server packet may emit several notifyUI commands. We
// accumulate the MAX performance beat (ms) across them here — computed from the CLEAN
// JSON data the VM emits (string fields are plain strings; the raw envelope's
// data.type is a CBOR byte string, cbor-x-asio gotcha, so paceFor must run HERE, not
// on the envelope). feed() reads + clears it after feedPacket so the router can wait
// that long before the next packet. See stores/pacing.ts + index.ts feedVmOrdered.
let pendingBeatMs = 0
function takePendingBeat(): number { const b = pendingBeatMs; pendingBeatMs = 0; return b }

// Animate dispatch — mirrors RoomLogic.js callbacks["Animate"] (1310-1372). Routes
// each animation type to the animationStore (per-player or scene channel). The data
// is clean JSON (prelude safeEncode), so string fields are plain strings here.
function handleAnimate(data: unknown, vm: ClientVm | null): void {
  const d = data as { type?: string; from?: number; to?: unknown; player?: number; emotion?: string; is_card?: boolean; name?: string; skill_type?: string; deputy?: boolean; path?: string }
  const anim = useAnimationStore.getState()
  switch (d?.type) {
    case 'Indicate': {
      // to = [[pid, ...], ...]; each entry is a chain (RoomLogic.js:1313-1319).
      const chains = Array.isArray(d.to) ? (d.to as unknown[]).map((c) => (Array.isArray(c) ? c.map(Number) : [Number(c)])) : []
      anim.pushScene({ kind: 'indicate', from: Number(d.from), chains })
      // Also pulse a "targeted" ring on every target player so the who→whom cue is
      // unmistakable (and survives a missed line) — answers "know targets w/o the log".
      anim.pushTargeted([...new Set(chains.flat())].filter((id) => id !== Number(d.from)))
      break
    }
    case 'Emotion': {
      // player is a cid when is_card (setCardEmotion); else a player id.
      const emotion = String(d.emotion ?? '')
      if (!emotion) break
      if (d.is_card) anim.pushCard(Number(d.player), { kind: 'emotion', emotion })
      else anim.pushPlayer(Number(d.player), { kind: 'emotion', emotion })
      break
    }
    case 'InvokeSkill': {
      const name = String(d.name ?? '')
      if (vm && name && !hasTranslation(name)) registerTranslations(vm.translate([name]))
      anim.pushPlayer(Number(d.player), { kind: 'invokeSkill', skillName: tr(name), skillType: String(d.skill_type || 'special') })
      break
    }
    case 'InvokeUltSkill': {
      const name = String(d.name ?? '')
      if (vm && name && !hasTranslation(name)) registerTranslations(vm.translate([name]))
      anim.pushScene({ kind: 'ultSkill', player: Number(d.player), skillName: tr(name), deputy: !!d.deputy })
      break
    }
    case 'SuperLightBox': {
      // Only the built-in default path; package-specific complex qml is out of scope
      // (M5) — render nothing rather than stall (no timer involved; pure notify).
      anim.pushScene({ kind: 'superLightBox', path: String(d.path ?? '') })
      break
    }
    // 'LightBox' is a no-op in QML too (RoomLogic.js:1324-1325).
    default: break
  }
}

// Pick a card-move SFX by movement kind (W1-1 2f, user-added sounds). Draw = any
// card moving into a hand FROM the draw pile; otherwise a generic move/discard.
// One sound per batch (don't stack N plays for a multi-card move).
function playMoveCardsSound(data: unknown): void {
  const merged = (data as { merged?: { fromArea?: number; toArea?: number }[] })?.merged
  if (!Array.isArray(merged) || merged.length === 0) return
  // CardArea: PlayerHand=1, DrawPile=6.
  const isDraw = merged.some((m) => m.toArea === 1 && m.fromArea === 6)
  if (isDraw) playDrawSound()
  else playMoveSound()
}

// LogEvent dispatch — mirrors RoomLogic.js callbacks["LogEvent"] (1374-1442). Visual
// side here (tremble/emotion/death); audio is added in V-5. Damage shakes the target
// Photo and plays the "damage" emotion sprite.
function handleLogEvent(data: unknown): void {
  const d = data as { type?: string; to?: number; damageType?: string; damageNum?: number; num?: number; name?: string; general?: string; deputy?: string }
  const anim = useAnimationStore.getState()
  switch (d?.type) {
    case 'Damage': {
      const to = Number(d.to)
      anim.pushPlayer(to, { kind: 'tremble' })
      anim.pushPlayer(to, { kind: 'emotion', emotion: 'damage' })
      // RoomLogic.js:1382 — /audio/system/<damageType>[2 if num>1].
      const dt = String(d.damageType || 'normal_damage') + (Number(d.damageNum) > 1 ? '2' : '')
      playSystem(dt)
      break
    }
    case 'LoseHP': playSystem('losehp'); break
    case 'ChangeMaxHp': if (Number(d.num) < 0) playSystem('losemaxhp'); break
    case 'PlaySkillSound': {
      // RoomLogic.js:1396-1425 — try <skill>_<general>, <skill>_<deputy>, then <skill>.
      // general/deputy come on the event; fall back to the actor's mirror generals.
      playSkillSound(String(d.name ?? ''), d.general ? String(d.general) : undefined, d.deputy ? String(d.deputy) : undefined)
      break
    }
    case 'PlaySound': playByPath(String(d.name ?? '')); break
    case 'Death': {
      // Death voice uses the dead player's general (RoomLogic.js:1433-1436).
      const p = useGameStore.getState().players[Number(d.to)]
      if (p?.general) playDeath(p.general)
      break
    }
    default: break
  }
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
        // Whether a popup-style handler claimed this command (used by the unhandled-
        // notifyUI detector below — a 五谷-class guard). Declared out here so the
        // book-keeping after the try/catch can still read it.
        let popupHandled = false
        // The command handlers below dispatch UNTRUSTED server packets into many UI
        // stores. A malformed/edge-case packet (extension pkg, new card kind, …) can
        // make one handler throw; without a guard that exception bubbles all the way
        // back through notifyUI → the WASM feedPacket (the reported console error) and
        // can abort the rest of this packet's commands. Isolate per-command: log it
        // (so it's still diagnosable via fk_log) and keep going. The book-keeping
        // below (noteNotify + counters) always runs.
        try {
        // Drive the render caches, then update the debug feed.
        useGameStore.getState().apply(e.command, e.data)
        // Start the MiscStatus elapsed-time clock when the game starts (local tick,
        // like MiscStatus.qml's Timer).
        if (e.command === 'StartGame') { useMiscStore.getState().startClock(); playBgm() }
        // Operation countdown — 1:1 with QML: every request callback that needs UI
        // calls roomScene.activate() (RoomLogic.js), which restarts the bar. The
        // ui_emu click loop (UpdateRequestUI) and non-request notifies do NOT.
        if (ACTIVATE_COMMANDS.has(e.command)) useTimerStore.getState().activate()
        if (e.command === 'MoveCards') {
          useCardStore.getState().applyMoveCards(e.data)
          playMoveCardsSound(e.data)
          // The VM only emits UpdateDrawPile from RefreshStatusSkills (QML polls it on
          // a 200ms timer); we have no such poll, so the count would go stale during
          // play. draw_pile only changes on a move → re-read it from the VM mirror
          // after each MoveCards (event-driven, avoids a doString-leaking poll). (#2)
          const vm = get().vm
          if (vm) { try { useMiscStore.getState().setPileNum(vm.readPileNum()) } catch { /* non-fatal */ } }
        }
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
          // Expand-pile cards (active_skill expandPile, e.g. 遗计) arrive as _new
          // CardItems with ui_data.reason="expand"; they're not in any cardStore area
          // so feed()'s face fetch misses them. Fetch their faces now so CardLayer can
          // render them face-up.
          const change = e.data as { _new?: { type?: string; data?: { id?: number }; ui_data?: { reason?: string } }[] }
          if (get().vm && Array.isArray(change?._new)) {
            const expandCids = change._new
              .filter((it) => it?.type === 'CardItem' && it.ui_data?.reason === 'expand' && it.data?.id !== undefined)
              .map((it) => Number(it.data!.id))
            const cached = useCardFaceStore.getState().faces
            const need = expandCids.filter((c) => c > 0 && !cached[c])
            if (need.length > 0) useCardFaceStore.getState().merge(get().vm!.readCards(need))
          }
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
          log.info('reply', 'ReplyToServer (VM)', e.data)
          get().serverReply?.(e.data)
          useInteractionStore.getState().clear()
          useTimerStore.getState().deactivate()
        }
        else if (e.command === 'CancelRequest') {
          // RoomLogic.js:1221: state="notactive" only. The VM emits CancelRequest
          // before EVERY AskFor* command (client.lua:48-49), so this fires between
          // FillAG (lays out the 五谷/AG pile) and the AskForAG that activates it.
          // A blanket popup clear would wipe the AG box right before AskForAG only
          // mutates it — leaving nothing to show. Keep the AG box (QML closes it only
          // via CloseAG → manualBox.close(), RoomLogic.js:1476).
          useInteractionStore.getState().clear(); usePopupStore.getState().clearExceptAg(); useFocusStore.getState().clear()
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
        else if (e.command === 'UpdateCard') {
          // A card's data changed in place (transform / reveal / virtual filter) —
          // QML re-fetches GetCardData and resets the face (RoomLogic.js:680-705).
          // Our cardFaceStore caches faces per cid permanently and feed()'s fetch
          // skips already-cached cids, so without this the transformed card keeps its
          // stale face. Force a re-read + overwrite for this cid. data = the cid.
          const cid = Number(Array.isArray(e.data) ? e.data[0] : e.data)
          if (get().vm && cid > 0) useCardFaceStore.getState().merge(get().vm!.readCards([cid]))
        }
        else if (e.command === 'SetCardFootnote') {
          // {ids[], log, virtual} (room.lua:494). log is already parseMsg-localized
          // (client.lua setCardNote). Annotate the table card(s) (RoomLogic.js sets
          // card.footnote). data = [ids, log, virtual].
          const arr = e.data as unknown[]
          const ids = Array.isArray(arr?.[0]) ? (arr[0] as number[]).map(Number) : []
          if (ids.length > 0) useCardNoteStore.getState().setFootnote(ids, String(arr?.[1] ?? ''))
        }
        else if (e.command === 'SetCardVirtName') {
          // {ids[], name, virtual} (room.lua:502) — virtual transformed name on a
          // table card. data = [ids, name, virtual].
          const arr = e.data as unknown[]
          const ids = Array.isArray(arr?.[0]) ? (arr[0] as number[]).map(Number) : []
          if (ids.length > 0) useCardNoteStore.getState().setVirtName(ids, String(arr?.[1] ?? ''))
        }
        else if (e.command === 'ChangeSelf') {
          // Observer switched viewpoint (client.lua changeSelf → notifyUI ChangeSelf).
          // The VM's Self is already rebound; re-read the mirror so isSelf flips and
          // gameStore re-rotates seats around the new viewpoint (RoomLogic.js:1550).
          void get().refreshPlayers()
        }
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
        else if (e.command === 'UpdateDrawPile') {
          // Remaining draw-pile count (RoomLogic.js:1520 → miscStatus.pileNum). data = int.
          useMiscStore.getState().setPileNum(Number(Array.isArray(e.data) ? e.data[0] : e.data) || 0)
        }
        else if (e.command === 'UpdateRoundNum') {
          // Current round (RoomLogic.js:1525 → miscStatus.roundNum). data = int.
          useMiscStore.getState().setRoundNum(Number(Array.isArray(e.data) ? e.data[0] : e.data) || 0)
        }
        else if (e.command === 'Animate') {
          // Pure visual effect (room.lua doAnimate). data={type, ...}. RoomLogic.js
          // callbacks["Animate"]:1310-1372 dispatches by type.
          handleAnimate(e.data, get().vm)
        }
        else if (e.command === 'LogEvent') {
          // Visual + audio event (room.lua sendLogEvent). data={type, ...}.
          // RoomLogic.js callbacks["LogEvent"]:1374-1442. Audio comes in V-5; here we
          // drive the visual side (Damage → tremble + "damage" emotion, Death).
          handleLogEvent(e.data)
        }
        // Popup-style requests (AskForGeneral/Choice/cards/AG/arrange) — not ui_emu.
        else if ((popupHandled = usePopupStore.getState().handle(e.command, e.data))) {
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
              ...(active.ccCards ?? []),
              ...(active.mbCards ?? []),
              ...((active.groups ?? []).flatMap((g) => g.cards.map((c) => c.cid))),
            ]
            const cached = useCardFaceStore.getState().faces
            const need = cardCids.filter((c) => c > 0 && !cached[c])
            if (need.length > 0) useCardFaceStore.getState().merge(get().vm!.readCards(need))
            // MoveCardInBoard: resolve virtual-equip display names per owning player
            // (RoomLogic.js:1114 getVirtualEquipData). Board equips may be "virtual"
            // (equipped-as another card); readCards alone can't know the owner.
            if (active.kind === 'moveBoard' && active.mbCards && active.mbCards.length > 0) {
              const cards = active.mbCards
              const positions = active.mbPositions ?? []
              const playerIds = active.mbPlayerIds ?? []
              const pairs = cards.map((cid, i) => [playerIds[positions[i] ?? 0] ?? 0, cid] as [number, number])
              const virt = get().vm!.virtualEquipNames(pairs)
              if (Object.keys(virt).length > 0) usePopupStore.setState((s) => (s.active?.kind === 'moveBoard' ? { active: { ...s.active, mbVirtNames: virt } } : {}))
            }
          }
        }
        } catch (err) {
          // One command's handler threw on this server packet — log it (diagnosable
          // via fk_log=debug) instead of letting it bubble into the WASM feedPacket
          // and surface as an uncaught console error / abort the remaining commands.
          log.error('error', `notifyUI handler threw for "${e.command}"`, err)
        }
        // Detect 五谷-class gaps: any notifyUI no store consumed. popupHandled covers
        // dynamically-added popup commands; HANDLED_EXPLICIT/MIRROR_DRIVEN cover the
        // rest (see diag/log.ts). Also feeds the structured comms log.
        noteNotify(e.command, e.data, popupHandled)
        // PACE-1: accumulate the performance beat for this command (clean JSON data),
        // taking the max across all commands emitted by this packet. feed() drains it.
        const beat = paceFor(e.command, e.data)
        if (beat > pendingBeatMs) pendingBeatMs = beat
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
    if (!vm) return 0
    // Only server request/notify packets carry raw CBOR for the VM.
    const raw = (env as NotifyEnvelope | RequestEnvelope).raw
    if (!raw) return 0
    const isRequest = env.kind === 'request'
    const bytes = base64ToBytes(raw)
    log.debug('vm-feed', `${env.command}${isRequest ? ' [req]' : ''} ${bytes.length}B`, env.command)
    // (The operation countdown is driven by CountdownBar off the active-request
    // edge with a fixed 30s window — no per-packet timer wiring here.)
    // A single bad packet must not break the feed chain (which would freeze all
    // subsequent packets). Log it and keep going; still re-sync the roster after.
    try {
      await vm.feedPacket(env.command, bytes, isRequest)
      set((s) => ({ totalFed: s.totalFed + 1 }))
    } catch (err) {
      log.error('error', `feedPacket ${env.command} threw`, (err as Error).message)
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
    // After a reconnect (Reconnect packet), the server doesn't replay UpdateDrawPile,
    // so the pile count would stay 0 until the next pile change. Re-read it from the
    // VM mirror now (W1-1 2c). The elapsed-time clock re-anchors via the persisted
    // miscStore anchor when StartGame replays (2b).
    if (env.command === 'Reconnect') {
      try { useMiscStore.getState().setPileNum(vm.readPileNum()) } catch { /* non-fatal */ }
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
    // PACE-1: return the accumulated performance beat (ms) for this packet so the
    // router (feedVmOrdered) can pause before the next packet. Drained here regardless
    // of which notifyUI commands fired; 0 for state-mirror/request/audio-only packets.
    return takePendingBeat()
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

  refreshPlayers: async () => {
    const vm = get().vm
    if (!vm) return
    try {
      const players = await vm.readPlayers()
      useGameStore.getState().syncPlayers(players)
      useGameStore.getState().setSelfSkills(vm.readSkills())
    } catch (err) {
      console.error('[vm] refreshPlayers threw:', err)
    }
  },

  switchViewpoint: async (pid) => {
    const vm = get().vm
    if (!vm) return
    // changeSelf rebinds VM Self + emits notifyUI("ChangeSelf") → the ChangeSelf
    // branch calls refreshPlayers. Also refresh here in case the notify is swallowed.
    if (vm.changeSelf(pid)) await get().refreshPlayers()
  },

  reset: () => {
    get().vm?.close()
    useGameStore.getState().resetGame()
    useCardStore.getState().reset()
    useCardFaceStore.getState().reset()
    useInteractionStore.getState().clear()
    usePopupStore.getState().clear()
    useLogStore.getState().reset()
    useFocusStore.getState().clear()
    useAnimationStore.getState().reset()
    useCardNoteStore.getState().reset()
    useMiscStore.getState().reset()
    stopBgm() // stop game BGM on leave/reconnect (StartGame replay restarts it)
    set({ vm: null, booted: false, booting: false, notifyCounts: {}, recent: [], totalFed: 0, stats: undefined, error: undefined })
  },

  // Back-to-room after GameOver: clear ALL transient per-game state but KEEP the VM
  // (rebuilt via resetClientLua, not closed) and the roster (gameStore.backToRoom +
  // re-sync handle that). Without this, the previous game's cards/marks/logs/popups/
  // animations/round-counter/thinking-bars linger into the waiting room and next game.
  resetForNewGame: () => {
    useCardStore.getState().reset()
    useCardFaceStore.getState().reset()
    useInteractionStore.getState().clear()
    usePopupStore.getState().clear()
    useLogStore.getState().reset()
    useFocusStore.getState().clear()
    useAnimationStore.getState().reset()
    useCardNoteStore.getState().reset()
    useMiscStore.getState().reset()
    useMiscStore.getState().clearClock() // back-to-room after GameOver → next game's clock is fresh (2b)
    stopBgm() // game ended → stop BGM until next StartGame
    useTimerStore.getState().deactivate()
    set({ notifyCounts: {}, recent: [], totalFed: 0 })
  },
}))
