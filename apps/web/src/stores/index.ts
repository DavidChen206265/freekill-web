// stores — Zustand stores fed by gateway envelopes. They hold normalized state
// for rendering; no game logic (that's the VM's job, M2+). For the lobby, state
// is just the decoded envelope data.

import { create } from 'zustand'
import type { Envelope, NotifyEnvelope, RequestEnvelope } from '@freekill-web/protocol'
import { base64ToBytes } from '@freekill-web/protocol'
import { GatewayClient, type GatewayStatus, type LoginCredentials } from '../net/gatewayClient.js'
import { useVmStore } from './vmStore.js'
import { usePopupStore } from './popupStore.js'
import { useGameStore } from './gameStore.js'
import { useTimerStore } from './timerStore.js'
import { useLogStore } from './logStore.js'
import { isRoomBootstrap } from './roomRouting.js'
import { waitBeat } from './pacing.js'
import { useServerManifestStore, parseManifest } from './serverManifestStore.js'
import { setArtPacks } from '../table/skin.js'
import { setAudioPacks } from '../table/audio.js'

// ---- connection ----
interface ConnectionState {
  client: GatewayClient | null
  status: GatewayStatus
  detail?: string
  serverUrl: string
  reconnecting: boolean
  /** Set when the server kicked us because the same account logged in elsewhere
   *  (IG-7). We then STOP auto-reconnecting (otherwise the two clients fight a
   *  takeover war) and surface this so the UI can tell the user. */
  kickedMessage?: string
  connect: (url: string, creds: LoginCredentials) => void
  disconnect: () => void
  tryAutoLogin: () => boolean
}

// Persisted credentials (R2 reconnect). User chose localStorage persistence for
// fully-seamless reconnect across WS drops AND hard page refresh / browser restart
// (decision 2026-06-08, see plan §R2 + risk R-CRED). SECURITY DEBT: this stores
// the plaintext password in localStorage (XSS/same-origin readable). Acceptable
// for the MVP's seamless-reconnect UX; production (M6) must replace it with a
// short-lived session token / server session. Isolated here so that swap is local.
const CRED_KEY = 'fk-creds'
interface StoredCreds { url: string; user: string; password: string; uuid: string }
function loadCreds(): StoredCreds | null {
  try {
    const raw = localStorage.getItem(CRED_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as StoredCreds
    return c.url && c.user && c.password ? c : null
  } catch { return null }
}
function saveCreds(c: StoredCreds): void {
  try { localStorage.setItem(CRED_KEY, JSON.stringify(c)) } catch { /* ignore quota/denied */ }
}
function clearCreds(): void {
  try { localStorage.removeItem(CRED_KEY) } catch { /* ignore */ }
}

// Auto-reconnect tuning: a dropped WS (not an explicit logout) retries with the
// stored credentials. asio detects the in-game player on re-login and resends the
// room as a Reconnect packet (verified against real asio 2026-06-08). Capped
// backoff; cleared on success or explicit disconnect.
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 8000
const RECONNECT_MAX_TRIES = 10

export const useConnectionStore = create<ConnectionState>((set, get) => {
  let intentionalClose = false
  let reconnectTries = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let lastCreds: StoredCreds | null = null

  const clearReconnectTimer = () => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  }

  const scheduleReconnect = () => {
    if (intentionalClose || !lastCreds) return
    if (reconnectTries >= RECONNECT_MAX_TRIES) { set({ reconnecting: false }); return }
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectTries, RECONNECT_MAX_MS)
    reconnectTries++
    set({ reconnecting: true })
    clearReconnectTimer()
    reconnectTimer = setTimeout(() => {
      const c = lastCreds!
      // Reset VM + routing so asio's resent Setup/Reconnect rebuilds a clean state.
      useVmStore.getState().reset()
      resetRoutingState()
      doConnect(c.url, c)
    }, delay)
  }

  const doConnect = (url: string, creds: LoginCredentials) => {
    // Guard against duplicate connections (React StrictMode double-invokes the
    // mount effect in dev, and reconnect could overlap a manual connect): if a WS
    // is already connecting or online, don't open a second one — that floods the
    // gateway's per-IP login rate limit and gets us 4029'd on refresh.
    const cur = get()
    if (cur.client && (cur.status === 'connecting' || cur.status === 'logging-in' || cur.status === 'online')) return
    get().client?.disconnect()
    const client = new GatewayClient({
      url,
      onStatus: (status, detail) => {
        set({ status, detail })
        if (status === 'online') {
          reconnectTries = 0
          set({ reconnecting: false })
        }
        // Rate-limited (4029) or auth-failed closes must NOT auto-reconnect — that
        // perpetuates the flood. Only an UNEXPECTED transport close retries.
        const limited = typeof detail === 'string' && (detail.includes('4029') || detail.includes('too many'))
        if (status === 'failed' && limited) { set({ reconnecting: false }); return }
        // An unexpected close (not an explicit logout, not rate-limit, not a duplicate-
        // login kick) reconnects. IG-7: a duplicate-login kick must NOT reconnect —
        // doing so starts a takeover war with the client that legitimately took over.
        if (status === 'closed' && !intentionalClose && !limited && !duplicateLoginKick) scheduleReconnect()
      },
      onEnvelope: (env) => routeEnvelope(env),
    })
    set({ client, serverUrl: url, status: 'connecting', detail: undefined })
    useAuthStore.setState({ username: creds.user })
    // VM outbound (Heartbeat etc.) → gateway notify.
    useVmStore.getState().setServerSender((command, data) => client.notify(command, data))
    // VM reply (ReplyToServer) → gateway reply. Echo the requestId of the request
    // we're actually answering (captured in routeEnvelope) instead of 0. The
    // gateway falls back to its own lastRequestId guess when we send 0, but that
    // guess can be stale when several requests are in flight (multi-human game
    // start: the batched AskForGeneral to all non-lords) — a wrong id makes asio
    // treat the reply as never-arrived and substitute the default (random) general.
    useVmStore.getState().setServerReply((data) => client.reply(currentRequestId, data))
    // Popup requests (AskForGeneral/Choice/...) reply the same way.
    usePopupStore.getState().setReplySender((data) => client.reply(currentRequestId, data))
    client.connect(creds)
  }

  return {
    client: null,
    status: 'idle',
    serverUrl: '',
    reconnecting: false,
    connect: (url, creds) => {
      intentionalClose = false
      duplicateLoginKick = false // fresh manual login — clear any prior kick state
      reconnectTries = 0
      clearReconnectTimer()
      const uuid = creds.uuid ?? `web-${crypto.randomUUID()}`
      lastCreds = { url, user: creds.user, password: creds.password, uuid }
      saveCreds(lastCreds)
      set({ kickedMessage: undefined })
      doConnect(url, { ...creds, uuid })
    },
    disconnect: () => {
      intentionalClose = true
      clearReconnectTimer()
      lastCreds = null
      clearCreds()
      get().client?.disconnect()
      useVmStore.getState().reset()
      resetRoutingState()
      set({ client: null, status: 'idle', reconnecting: false })
    },
    // Called on app mount: if we have stored credentials, reconnect automatically
    // (survives hard refresh / browser restart). Returns true if a login started.
    tryAutoLogin: () => {
      const c = loadCreds()
      if (!c) return false
      intentionalClose = false
      reconnectTries = 0
      lastCreds = c
      doConnect(c.url, c)
      return true
    },
  }
})

// ---- auth ----
interface AuthState {
  username: string
  userId?: number
  avatar?: string
}
export const useAuthStore = create<AuthState>(() => ({ username: '' }))

// ---- lobby ----
export interface RoomInfo {
  id: number
  name: string
  gameMode: string
  playerCount: number
  capacity: number
  hasPassword: boolean
  outdated: boolean
}
export interface ChatLine {
  who: string
  text: string
  at: number
}
interface LobbyState {
  online: number
  total: number
  rooms: RoomInfo[]
  chat: ChatLine[]
  enteredRoomId?: number
}
export const useLobbyStore = create<LobbyState>(() => ({
  online: 0,
  total: 0,
  rooms: [],
  chat: [],
}))

// Parse a raw UpdateRoomList entry [id, name, gameMode, playerCount, capacity,
// hasPassword, outdated] into a RoomInfo.
function parseRoom(entry: unknown): RoomInfo | null {
  if (!Array.isArray(entry) || entry.length < 7) return null
  const [id, name, gameMode, playerCount, capacity, hasPassword, outdated] = entry as [
    number, string, string, number, number, boolean, boolean,
  ]
  return { id, name, gameMode, playerCount, capacity, hasPassword, outdated }
}

// Central envelope router: maps server commands to store updates, and — once in
// a room — forwards every server packet's raw CBOR to the client VM (in order).
let inRoom = false
// IG-7: set when the server kicks us for a duplicate login ("others logged in again
// with this name"). The kick ErrorDlg arrives just before asio drops the TCP; the
// connection store reads this in its `closed` gate to SUPPRESS auto-reconnect — else
// this client would re-login, kick the other, get kicked back… a takeover war (the
// reported "new client stuck in 正在重连 while the old keeps playing"). A fresh manual
// connect() clears it.
let duplicateLoginKick = false
// asio's exact duplicate-login kick message (auth.cpp:475 / serverplayer.cpp:267).
const DUP_LOGIN_KICK = 'others logged in again with this name'
let feedChain: Promise<void> = Promise.resolve()
// The login Setup packet arrives during the lobby phase (before the VM exists).
// It carries [selfId, name, avatar] — the VM needs it to know who Self is, so we
// stash it and replay it into the VM right after boot, before EnterRoom.
let loginSetup: Envelope | null = null
// The requestId of the most recent server REQUEST packet. A client reply must
// echo it so asio matches it to the pending request (router expectedReplyIds).
// We track it client-side (not just the gateway's lastRequestId) because the reply
// senders fire from React/VM callbacks that don't carry the id; capturing it at the
// exact request that opened the prompt avoids the gateway's stale-guess race.
let currentRequestId = 0

// Reset the routing module state for a fresh (re)connection. On reconnect the
// gateway opens a brand-new asio TCP and asio resends the whole room (Setup +
// Reconnect/EnterRoom + full state), so we must clear inRoom/loginSetup and the
// feed chain — otherwise the stale `inRoom=true` would route the resent Setup/
// Reconnect packets straight into a not-yet-rebooted VM. The VM itself is reset
// separately (vmStore.reset) so the Reconnect rebuild (clientbase loadRoomSummary)
// starts from a clean ClientInstance.
function resetRoutingState(): void {
  inRoom = false
  loginSetup = null
  feedChain = Promise.resolve()
  currentRequestId = 0
}

function feedVmOrdered(env: Envelope): void {
  // Serialize VM feeds so packets are applied in arrival order despite async.
  // Performance beat (PACE-1): feed() returns the performance beat (ms) for the packet
  // — the max animation duration among the notifyUI commands it emitted (MoveCards/
  // Animate/Indicate/Emotion/InvokeSkill/Damage…). We pause that long before the next
  // packet feeds, reintroducing the cadence the original Qt client gets for free from
  // QML `Behavior` interpolation (memory game-pacing-server-vs-client). The beat is
  // computed inside the VM dispatch where data is clean JSON — NOT from the raw
  // envelope, whose data.type is a CBOR byte string (cbor-x-asio gotcha). The wait runs
  // AFTER feed() so the state mirror is already applied; only the START of the next
  // command is delayed. State-mirror / audio-only packets return 0 (no pause).
  // REQUEST packets ALSO get no pause: feed() returns their beat too, but a request's
  // commands are non-visual, and even if not, the player's prompt must appear at once —
  // so we hard-skip the wait for requests (fast path).
  feedChain = feedChain
    .then(async () => {
      const beat = await useVmStore.getState().feed(env)
      if (env.kind !== 'request') await waitBeat(beat)
    })
    .catch((err) => onVmError(`feed ${env.command}`, err))
}

// Surface VM errors instead of swallowing them (so failures aren't silent hangs).
function onVmError(where: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[vm] ${where} failed:`, err)
  useVmStore.setState({ error: `${where}: ${msg}` })
}

function routeEnvelope(env: Envelope): void {
  // War-report replay after a reconnect: the gateway buffered the RAW inner CBOR of
  // each GameLog (asio's resync omits past log lines). The live path cbor-decodes +
  // runs each through the VM's parseMsg → localized HTML (clientbase.lua appendLog);
  // the LogMessage fields are CBOR BYTE STRINGS so we MUST feed the raw bytes (JSON is
  // lossy). Prettify each through the rebuilt VM and prepend them (before the VM
  // rebuild's own fresh lines). Chain onto feedChain so the VM is booted AND the
  // Reconnect state resync (player/seat/general mirror parseMsg reads) has been applied
  // first. Fall back to the raw string per-line if parseMsg fails.
  if (env.kind === 'notify' && (env as NotifyEnvelope).command === '__gateway_log_replay') {
    const lines = (env as NotifyEnvelope).data
    if (Array.isArray(lines)) {
      const rawB64 = lines.map(String)
      feedChain = feedChain
        .then(() => {
          const vm = useVmStore.getState().vm
          const html = rawB64.map((b64) => {
            try { return (vm?.parseLog(base64ToBytes(b64)) ?? null) || '' } catch { return '' }
          }).filter((s) => s.length > 0)
          if (html.length > 0) useLogStore.getState().prepend(html)
        })
        .catch((err) => onVmError('log replay', err))
    }
    return
  }
  // Capture the login Setup (lobby phase) so we can seed Self into the VM later.
  if (env.kind === 'notify' && (env as NotifyEnvelope).command === 'Setup') {
    loginSetup = env
  }

  // A room-bootstrap packet flips us into the room: boot the VM, replay the login
  // Setup (so Self is correct), then feed this packet. There are THREE asio
  // server→client commands that bootstrap a room VM:
  //   - EnterRoom  : normal join / waiting room (room.cpp:190)
  //   - Observe    : join a running room as observer (room.cpp:346)
  //   - Reconnect  : rejoin after disconnect (serverplayer.cpp:246)
  // The client Lua handles Observe/Reconnect via loadRoomSummary, which itself
  // re-emits notifyUI("EnterRoom") (clientbase.lua:470) + startGame() — but that
  // is a VM-OUTPUT notify on a different sink (vmStore→gameStore), NOT a server
  // packet seen here, so there is no double-boot. Previously only EnterRoom was
  // handled, so the Observe/Reconnect server packets fell through to the lobby
  // `default` and were dropped → the VM never booted → observe/reconnect broke.
  // CRITICAL: chain the boot onto feedChain so any packet arriving DURING boot
  // (e.g. AddPlayer for an existing player) queues behind it instead of being
  // dropped while vm is still null (that race caused a late joiner to not see
  // players already in the room).
  if (env.kind === 'notify' && isRoomBootstrap((env as NotifyEnvelope).command)) {
    inRoom = true
    // Observe = watching as an observer (can switch viewpoint, gets no requests).
    // Reconnect/EnterRoom = playing. Track it so the table can offer perspective
    // switching + skip player-only affordances.
    useGameStore.getState().setObserving((env as NotifyEnvelope).command === 'Observe')
    useLobbyStore.setState({ enteredRoomId: -1 })
    feedChain = feedChain
      .then(() => useVmStore.getState().bootIfNeeded())
      .then(async () => { await useVmStore.getState().feed(loginSetup ?? env) }) // Setup first if present
      .then(async () => { if (loginSetup) await useVmStore.getState().feed(env) }) // bootstrap packets don't pace
      .catch((err) => onVmError('enter room', err))
    return
  }
  if (env.kind === 'notify' && (env as NotifyEnvelope).command === 'EnterLobby') {
    inRoom = false
    useVmStore.getState().reset()
    useLobbyStore.setState({ enteredRoomId: undefined })
    return
  }

  if (inRoom) {
    // In-room: the VM owns game state. Feed every server packet (notify+request).
    // Capture the requestId of REQUEST packets so replies (VM ReplyToServer or a
    // popup resolve) echo the right id — see currentRequestId / setServerReply.
    // Also capture the server's real timeout/timestamp so the countdown bar matches
    // the server's actual window (the room timeout, e.g. 90s) instead of a fixed
    // guess — otherwise the bar hits 0 long before the server picks the default,
    // leaving the player waiting (timeout in SECONDS, timestamp in ms epoch; the
    // server times out at timestamp + timeout*1000 + 500, request.lua:210).
    if (env.kind === 'request') {
      const r = env as RequestEnvelope
      currentRequestId = r.requestId
      if (r.timeout && r.timestamp) useTimerStore.getState().setServerWindow(r.timeout * 1000, r.timestamp)
    }
    feedVmOrdered(env)
    return
  }

  // Lobby-phase notifies (no VM).
  if (env.kind !== 'notify') return
  const { command, data } = env as NotifyEnvelope
  switch (command) {
    case 'Heartbeat': {
      // asio sends Heartbeat every 30s to all online players and decrements ttl
      // (server.cpp:64-90, max_ttl=6); a client→server Heartbeat resets ttl
      // (serverplayer.cpp:170). In a room the VM replies via ClientBase:heartbeat
      // (notifyServer → setServerSender → gateway). In the LOBBY the VM isn't
      // booted, so without this echo ttl hits 0 and the player is kicked after
      // ~3 min of idling in the lobby. Reply with the same notify the VM would.
      useConnectionStore.getState().client?.notify('Heartbeat', '')
      break
    }
    case 'UpdatePlayerNum': {
      // [lobbyPlayers, totalPlayers] (asio updateOnlineInfo)
      if (Array.isArray(data)) {
        useLobbyStore.setState({ online: Number(data[0] ?? 0), total: Number(data[1] ?? 0) })
      }
      break
    }
    case 'UpdateRoomList': {
      const rooms = Array.isArray(data) ? data.map(parseRoom).filter((r): r is RoomInfo => r !== null) : []
      useLobbyStore.setState({ rooms })
      break
    }
    case 'SetServerSettings': {
      // [motd, hiddenPacks, enabledFeatures, manifest?] — the Web-only fork (W0-2)
      // appends a 4th element with { webOnly, serverBuild, assetVersion,
      // enabledPacks, webFeatures }. Old servers send only 3 → manifest stays null
      // and consumers keep current behavior. enabledPacks becomes the single source
      // of truth for art/audio pack resolution (replaces hardcoded ART_PKGS).
      if (Array.isArray(data)) {
        const manifest = parseManifest(data[3])
        if (manifest) {
          useServerManifestStore.setState(manifest)
          if (manifest.enabledPacks.length > 0) {
            setArtPacks(manifest.enabledPacks)
            setAudioPacks(manifest.enabledPacks)
          }
        }
      }
      break
    }
    case 'Chat': {
      // chat payload shape varies; store a best-effort line.
      const line = normalizeChat(data)
      if (line) useLobbyStore.setState((s) => ({ chat: [...s.chat.slice(-199), line] }))
      break
    }
    case 'ErrorMsg':
    case 'ErrorDlg': {
      const text = String(data)
      // IG-7: duplicate-login kick → stop the takeover war. Flag it so the imminent
      // WS close does NOT auto-reconnect, and surface a clear message to the user.
      if (text.includes(DUP_LOGIN_KICK)) {
        duplicateLoginKick = true
        useConnectionStore.setState({ kickedMessage: '你的账号已在别处登录，此客户端已断开。', reconnecting: false })
      }
      useLobbyStore.setState((s) => ({
        chat: [...s.chat.slice(-199), { who: '系统', text: `错误: ${text}`, at: Date.now() }],
      }))
      break
    }
    default:
      // Other lobby notifies (UpdateAvatar, etc.) are ignored in M1.
      break
  }
}

function normalizeChat(data: unknown): ChatLine | null {
  if (typeof data === 'string') return { who: '', text: data, at: Date.now() }
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    const who = String(o.userName ?? o.sender ?? o.who ?? '')
    const text = String(o.msg ?? o.text ?? o.s ?? JSON.stringify(o))
    return { who, text, at: Date.now() }
  }
  return null
}
