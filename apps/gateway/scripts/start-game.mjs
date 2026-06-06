// start-game.mjs — verifies the waiting-room → start flow end to end against asio.
// Two browser-like WS clients: A creates a 2-player room (becomes owner), B joins
// (room full). B readies. A starts. Both must receive StartGame. Exercises the
// gateway + asio Ready/StartGame path the WaitingRoom UI drives.
//
// Usage: ASIO_HOST=<wsl-ip> node scripts/start-game.mjs  (starts its own bridge)

import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }
const config = loadConfig()
const bridge = startWsBridge(config)
const stamp = Date.now() % 100000
const roomName = `sg_${stamp}`
const URL = `ws://localhost:${config.wssPort}`

function client(user) {
  const ws = new WebSocket(URL)
  const seen = []
  const api = { ws, seen, roomId: null, gotStartGame: false }
  ws.on('open', () => ws.send(JSON.stringify({ kind: 'notify', command: '__gateway_login', data: { user, password: 'p', uuid: `sg-${user}-${stamp}` } })))
  ws.on('message', (raw) => {
    let env; try { env = JSON.parse(raw.toString()) } catch { return }
    seen.push(env.command)
    if (env.command === 'StartGame') api.gotStartGame = true
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

const A = client(`sgA_${stamp}`)
await until(() => A.seen.includes('EnterLobby'))
// A creates a 2-player room (capacity 2) and is moved into it as owner.
A.ws.send(JSON.stringify({ kind: 'notify', command: 'CreateRoom', data: [roomName, 2, 90, { gameMode: 'aaa_role_mode', roomName, password: '', disabledPack: [], disabledGenerals: [] }] }))
if (!await until(() => A.seen.includes('EnterRoom'))) done(1, '[sg] FAIL: A did not enter room')
console.log('[sg] A created+entered room (owner)')

// B logs in, finds the room, joins → room full.
const B = client(`sgB_${stamp}`)
await until(() => B.seen.includes('EnterLobby'))
B.ws.send(JSON.stringify({ kind: 'notify', command: 'RefreshRoomList', data: '' }))
if (!await until(() => B.roomId !== null)) done(1, '[sg] FAIL: B never saw room')
B.ws.send(JSON.stringify({ kind: 'notify', command: 'EnterRoom', data: [B.roomId, ''] }))
if (!await until(() => B.seen.includes('EnterRoom'))) done(1, '[sg] FAIL: B did not enter')
console.log('[sg] B joined (room full)')

// B readies (non-owner). Then A starts.
await wait(300)
B.ws.send(JSON.stringify({ kind: 'notify', command: 'Ready', data: '' }))
const bReady = await until(() => B.seen.includes('ReadyChanged') || A.seen.includes('ReadyChanged'))
console.log('[sg] ReadyChanged seen:', bReady)
await wait(300)
A.ws.send(JSON.stringify({ kind: 'notify', command: 'StartGame', data: '' }))

const started = await until(() => A.gotStartGame && B.gotStartGame, 10000)
if (started) done(0, `[sg] PASS: both clients received StartGame. A: ${A.seen.join(',')}`)
else done(1, `[sg] FAIL: StartGame not received by both. A.start=${A.gotStartGame} B.start=${B.gotStartGame}\nA: ${A.seen.join(',')}\nB: ${B.seen.join(',')}`)
