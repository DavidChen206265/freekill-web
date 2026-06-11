// ig5-chat-probe.mjs — IG-5 verification: in-game room chat (Chat type=2) + 送花/砸蛋
// presents broadcast through real asio to both players. A creates a 2-player room, B
// joins, both ready, A starts; then A sends a text chat and a "$@Flower:<B>" present.
// Asserts B (and A) receive both Chat broadcasts with the right sender + msg.
// Usage: ASIO_HOST=<wsl-ip> node scripts/ig5-chat-probe.mjs

import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }
const config = loadConfig()
const bridge = startWsBridge(config)
const stamp = Date.now() % 100000
const roomName = `ig5_${stamp}`
const URL = `ws://localhost:${config.wssPort}`

// Coerce a value that may be a string OR a CBOR byte-string-decoded object/array.
function bytesToStr(v) {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const codes = Array.isArray(v) ? v : Object.keys(v).filter((k) => /^\d+$/.test(k)).sort((a, b) => a - b).map((k) => v[k])
    if (codes.length && codes.every((c) => typeof c === 'number')) return String.fromCharCode(...codes)
  }
  return ''
}

function client(user) {
  const ws = new WebSocket(URL)
  const seen = []
  const chats = [] // {sender, msg}
  const api = { ws, seen, chats, roomId: null, selfId: null }
  ws.on('open', () => ws.send(JSON.stringify({ kind: 'notify', command: '__gateway_login', data: { user, password: 'p', uuid: `ig5-${user}-${stamp}` } })))
  ws.on('message', (raw) => {
    let env; try { env = JSON.parse(raw.toString()) } catch { return }
    seen.push(env.command)
    if (env.command === 'Setup' && Array.isArray(env.data)) api.selfId = Number(env.data[0])
    if (env.command === 'Chat') {
      const d = env.data || {}
      api.chats.push({ sender: Number(d.sender), msg: bytesToStr(d.msg) })
    }
    if (env.command === 'UpdateRoomList' && Array.isArray(env.data)) {
      const r = env.data.find((x) => Array.isArray(x) && x[1] === roomName)
      if (r) api.roomId = r[0]
    }
  })
  return api
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100) } return false }
const done = (code, msg) => { console.log(msg); try { A.ws.close(); B.ws.close() } catch {} bridge.close().then(() => process.exit(code)) }

const A = client(`ig5A_${stamp}`)
await until(() => A.seen.includes('EnterLobby'))
const settings = {
  gameMode: 'aaa_role_mode', roomName, password: '',
  _game: { generalNum: 3, generalTimeout: 15, luckTime: 0, enableFreeAssign: false, enableDeputy: false, enableObserverViewCard: false },
  _mode: {}, disabledPack: [], disabledGenerals: [],
}
A.ws.send(JSON.stringify({ kind: 'notify', command: 'CreateRoom', data: [roomName, 2, 30, settings] }))
if (!await until(() => A.seen.includes('EnterRoom'))) done(1, '[ig5] FAIL: A did not enter room')

const B = client(`ig5B_${stamp}`)
await until(() => B.seen.includes('EnterLobby'))
B.ws.send(JSON.stringify({ kind: 'notify', command: 'RefreshRoomList', data: '' }))
if (!await until(() => B.roomId !== null)) done(1, '[ig5] FAIL: B never saw room')
B.ws.send(JSON.stringify({ kind: 'notify', command: 'EnterRoom', data: [B.roomId, ''] }))
if (!await until(() => B.seen.includes('EnterRoom'))) done(1, '[ig5] FAIL: B did not enter')
await wait(300)
B.ws.send(JSON.stringify({ kind: 'notify', command: 'Ready', data: '' }))
await until(() => A.seen.includes('ReadyChanged') || B.seen.includes('ReadyChanged'))
await wait(300)
A.ws.send(JSON.stringify({ kind: 'notify', command: 'StartGame', data: '' }))
await until(() => A.seen.includes('StartGame') && B.seen.includes('StartGame'), 12000)
console.log('[ig5] game started; sending room chat + present')

// A sends an in-game text chat (type=2) — must reach BOTH A and B.
const textMsg = `hello_${stamp}`
A.ws.send(JSON.stringify({ kind: 'notify', command: 'Chat', data: { type: 2, msg: textMsg } }))
const gotText = await until(() => B.chats.some((c) => c.msg === textMsg) && A.chats.some((c) => c.msg === textMsg), 6000)
if (!gotText) done(1, `[ig5] FAIL: text chat not broadcast to both.\nA.chats=${JSON.stringify(A.chats)}\nB.chats=${JSON.stringify(B.chats)}`)
console.log('[ig5] PASS(a): room text chat broadcast to both clients')

// A sends a 送花 present targeting B — broadcast as a "$@Flower:<Bid>" chat msg.
const presentMsg = `$@Flower:${B.selfId}`
A.ws.send(JSON.stringify({ kind: 'notify', command: 'Chat', data: { type: 2, msg: presentMsg } }))
const gotPresent = await until(() => B.chats.some((c) => c.msg === presentMsg), 6000)
if (gotPresent) done(0, `[ig5] PASS(b): present "$@Flower:${B.selfId}" broadcast (B received it). ALL PASS.`)
else done(1, `[ig5] FAIL: present not received by B.\nB.chats=${JSON.stringify(B.chats)}`)
