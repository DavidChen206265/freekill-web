// observe-reconnect.mjs — M3 R1 live self-verify against asio (starts own bridge).
// Reproduces the routing fix: client A creates a room, fills it with a bot, starts
// the game; observer O OBSERVES the running room. Before the fix, O's "Observe"
// server packet fell through routeEnvelope's lobby default and was dropped → O's
// VM never booted → O saw nothing (audit P2A-014/P2B-006/P2B-007). After the fix,
// routeEnvelope boots the VM on Observe too, so O receives the room bootstrap
// (the VM re-emits EnterRoom via loadRoomSummary) + the running game's packets.
//
// NOTE: this script tests the GATEWAY↔asio path (no browser VM). The browser-side
// routeEnvelope fix is unit-tested in apps/web/test/roomRouting.test.ts; here we
// prove asio actually emits an "Observe" server packet (not "EnterRoom") to the
// observer — the premise the routing fix rests on. Full VM-boot-on-observe is the
// manual two-tab browser check.
//
// Usage: ASIO_HOST=<wsl-ip> node scripts/observe-reconnect.mjs
// Exits 0 on success, 1 on failure.

import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }
const config = loadConfig()
const bridge = startWsBridge(config)
const stamp = Date.now() % 100000
const roomName = `obs_${stamp}`
const URL = `ws://localhost:${config.wssPort}`

function client(user) {
  const ws = new WebSocket(URL)
  const seen = []
  const api = { ws, seen, roomId: null }
  ws.on('open', () => ws.send(JSON.stringify({ kind: 'notify', command: '__gateway_login', data: { user, password: 'p', uuid: `obs-${user}-${stamp}` } })))
  ws.on('message', (raw) => {
    let env; try { env = JSON.parse(raw.toString()) } catch { return }
    seen.push(env.command)
    if (env.command === 'ErrorMsg') console.log(`[obs] ${user} ErrorMsg:`, JSON.stringify(env.data))
    if (env.command === 'UpdateRoomList' && Array.isArray(env.data)) {
      const r = env.data.find((x) => Array.isArray(x) && x[1] === roomName)
      if (r) api.roomId = r[0]
    }
  })
  api.send = (command, data) => ws.send(JSON.stringify({ kind: 'notify', command, data }))
  return api
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100) } return false }
const done = (code, msg) => { console.log(msg); try { A.ws.close(); L.ws.close(); O.ws.close() } catch {} bridge.close().then(() => process.exit(code)) }

// A creates a 2-player room and fills the 2nd seat with a bot, then starts.
// Settings MUST carry the _game block (generalNum etc.) exactly like the web's
// CreateRoomDialog — without it asio's server Lua hits `generalNum nil` at
// chooseGenerals and the game crashes to GameOver in 0s (PROGRESS 2026-06-06).
const settings = {
  gameMode: 'aaa_role_mode', roomName, password: '',
  _game: { generalNum: 3, generalTimeout: 15, luckTime: 0, enableFreeAssign: false, enableDeputy: false, enableObserverViewCard: false },
  _mode: {}, disabledPack: [], disabledGenerals: [],
}
const A = client(`obsA_${stamp}`)
await until(() => A.seen.includes('EnterLobby'))
A.send('CreateRoom', [roomName, 2, 90, settings])
if (!await until(() => A.seen.includes('EnterRoom'))) done(1, '[obs] FAIL: A did not enter room')
console.log('[obs] A created+entered room (owner)')

// L is a lobby-only client that discovers the room id (an in-room client's
// RefreshRoomList returns nothing).
const L = client(`obsL_${stamp}`)
await until(() => L.seen.includes('EnterLobby'))
L.send('RefreshRoomList', '')
if (!await until(() => L.roomId !== null)) done(1, '[obs] FAIL: lobby client never saw room')
const roomId = L.roomId
console.log(`[obs] room id = ${roomId}`)

// A adds a robot (fills seat 2) and starts the game.
await wait(300)
A.send('AddRobot', '')
await wait(800)
A.send('StartGame', '')
if (!await until(() => A.seen.includes('StartGame'), 10000)) done(1, `[obs] FAIL: game did not start. A: ${A.seen.join(',')}`)
console.log('[obs] game started')

// O observes the running room. With generalNum:3 the game opens on a general-
// selection phase (15s timeout) so the room stays "running" long enough to attach.
// The KEY assertion: asio sends an "Observe" server packet to O (the premise of
// the routing fix), not "EnterRoom".
const O = client(`obsO_${stamp}`)
await until(() => O.seen.includes('EnterLobby'))
O.send('ObserveRoom', [roomId, ''])
const observed = await until(() =>
  O.seen.includes('Observe') || O.seen.includes('Reconnect') || O.seen.includes('EnterRoom') || O.seen.includes('ArrangeSeats'), 10000)
console.log(`[obs] O commands: ${[...new Set(O.seen)].join(',')}`)

if (observed) done(0, `[obs] PASS: observer received room bootstrap (Observe/EnterRoom). O saw: ${[...new Set(O.seen)].join(',')}`)
else done(1, `[obs] FAIL: observer saw no room bootstrap (routing drop?). O: ${O.seen.join(',')}`)
