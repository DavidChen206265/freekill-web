// stores — Zustand stores fed by gateway envelopes. They hold normalized state
// for rendering; no game logic (that's the VM's job, M2+). For the lobby, state
// is just the decoded envelope data.

import { create } from 'zustand'
import type { Envelope, NotifyEnvelope, RequestEnvelope } from '@freekill-web/protocol'
import { GatewayClient, type GatewayStatus, type LoginCredentials } from '../net/gatewayClient.js'
import { useVmStore } from './vmStore.js'
import { usePopupStore } from './popupStore.js'

// ---- connection ----
interface ConnectionState {
  client: GatewayClient | null
  status: GatewayStatus
  detail?: string
  serverUrl: string
  connect: (url: string, creds: LoginCredentials) => void
  disconnect: () => void
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  client: null,
  status: 'idle',
  serverUrl: '',
  connect: (url, creds) => {
    get().client?.disconnect()
    const client = new GatewayClient({
      url,
      onStatus: (status, detail) => set({ status, detail }),
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
  },
  disconnect: () => {
    get().client?.disconnect()
    set({ client: null, status: 'idle' })
  },
}))

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

function feedVmOrdered(env: Envelope): void {
  // Serialize VM feeds so packets are applied in arrival order despite async.
  feedChain = feedChain
    .then(() => useVmStore.getState().feed(env))
    .catch((err) => onVmError(`feed ${env.command}`, err))
}

// Surface VM errors instead of swallowing them (so failures aren't silent hangs).
function onVmError(where: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[vm] ${where} failed:`, err)
  useVmStore.setState({ error: `${where}: ${msg}` })
}

function routeEnvelope(env: Envelope): void {
  // Capture the login Setup (lobby phase) so we can seed Self into the VM later.
  if (env.kind === 'notify' && (env as NotifyEnvelope).command === 'Setup') {
    loginSetup = env
  }

  // EnterRoom flips us into the room: boot the VM, replay the login Setup (so Self
  // is correct), then feed this packet. CRITICAL: chain the boot onto feedChain so
  // any packet arriving DURING boot (e.g. AddPlayer for an existing player) queues
  // behind it instead of being dropped while vm is still null (that race caused a
  // late joiner to not see players already in the room).
  if (env.kind === 'notify' && (env as NotifyEnvelope).command === 'EnterRoom') {
    inRoom = true
    useLobbyStore.setState({ enteredRoomId: -1 })
    feedChain = feedChain
      .then(() => useVmStore.getState().bootIfNeeded())
      .then(() => useVmStore.getState().feed(loginSetup ?? env)) // Setup first if present
      .then(() => { if (loginSetup) return useVmStore.getState().feed(env) })
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
    if (env.kind === 'request') currentRequestId = (env as RequestEnvelope).requestId
    feedVmOrdered(env)
    return
  }

  // Lobby-phase notifies (no VM).
  if (env.kind !== 'notify') return
  const { command, data } = env as NotifyEnvelope
  switch (command) {
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
    case 'Chat': {
      // chat payload shape varies; store a best-effort line.
      const line = normalizeChat(data)
      if (line) useLobbyStore.setState((s) => ({ chat: [...s.chat.slice(-199), line] }))
      break
    }
    case 'ErrorMsg':
    case 'ErrorDlg': {
      useLobbyStore.setState((s) => ({
        chat: [...s.chat.slice(-199), { who: '系统', text: `错误: ${String(data)}`, at: Date.now() }],
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
