// reconnect-probe.mjs — records what asio resends when an in-game player drops and
// reconnects (same credentials). Discipline item 4: record the first-packet
// sequence before abstracting the client-side reconnect handling.
//
// IMPORTANT (learned 2026-06-08): use TWO HUMANS (A+B fill a 2-cap room), not
// 1 human + bot. When the only human drops, asio ends the game (GameOver) so
// there is nothing to reconnect to. With 2 humans, A's drop leaves B in-game and
// A becomes a Run (bot-controlled) in-game player → asio reconnect() fires.
//
// A and B fill a 2-player room and start. Mid-game A's WS drops, then A reconnects
// (new WS, same user/password — asio auth.cpp:465-479 detects the in-game player
// via insideGame() and calls reconnect()). We log the exact command sequence asio
// resends to the reconnected A (expect a Reconnect packet + full room state).
//
// Usage: ASIO_HOST=<wsl-ip> node scripts/reconnect-probe.mjs

import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }
const config = loadConfig()
const bridge = startWsBridge(config)
const stamp = Date.now() % 100000
const roomName = `rc_${stamp}`
const URL = `ws://localhost:${config.wssPort}`
const creds = (user) => ({ user, password: 'p', uuid: `rc-${user}-${stamp}` })

function client(user, label) {
  const ws = new WebSocket(URL)
  const seen = []
  const api = { ws, seen, roomId: null, user }
  ws.on('open', () => ws.send(JSON.stringify({ kind: 'notify', command: '__gateway_login', data: creds(user) })))
  ws.on('message', (raw) => {
    let env; try { env = JSON.parse(raw.toString()) } catch { return }
    seen.push(env.command)
    if (env.command === 'UpdateRoomList' && Array.isArray(env.data)) {
      const r = env.data.find((x) => Array.isArray(x) && x[1] === roomName)
      if (r) api.roomId = r[0]
    }
    if (label) console.log(`  [${label}] <- ${env.command}`)
  })
  api.send = (command, data) => ws.send(JSON.stringify({ kind: 'notify', command, data }))
  return api
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100) } return false }
const done = (code, msg) => { console.log(msg); try { A.ws.close() } catch {} bridge.close().then(() => process.exit(code)) }

const settings = {
  gameMode: 'aaa_role_mode', roomName, password: '',
  _game: { generalNum: 3, generalTimeout: 15, luckTime: 0, enableFreeAssign: false, enableDeputy: false, enableObserverViewCard: false },
  _mode: {}, disabledPack: [], disabledGenerals: [],
}

const A = client(`rcA_${stamp}`)
await until(() => A.seen.includes('EnterLobby'))
A.send('CreateRoom', [roomName, 2, 90, settings])
if (!await until(() => A.seen.includes('EnterRoom'))) done(1, 'FAIL: A did not enter room')
// B is a SECOND HUMAN that fills the room (2-cap → full, no bot). This keeps the
// game alive when A drops (a lone human leaving would end the game).
const B = client(`rcB_${stamp}`)
await until(() => B.seen.includes('EnterLobby'))
B.send('RefreshRoomList', '')
if (!await until(() => B.roomId !== null)) done(1, 'FAIL: B never saw room')
const roomId = B.roomId
console.log(`room id = ${roomId}`)
B.send('EnterRoom', [roomId, ''])
if (!await until(() => B.seen.includes('EnterRoom'))) done(1, 'FAIL: B did not enter')
await wait(300)
B.send('Ready', '')
await until(() => A.seen.includes('ReadyChanged') || B.seen.includes('ReadyChanged'))
await wait(300)
A.send('StartGame', '')
if (!await until(() => A.seen.includes('StartGame'), 10000)) done(1, `FAIL: game did not start. A: ${A.seen.join(',')}`)
console.log('game started; letting it run into the general-selection request...')
await wait(2000)
const hadRequestPreDrop = A.seen.some((c) => c.startsWith('AskFor'))
console.log(`A pre-drop saw: ${A.seen.join(',')}`)
console.log(`A had a pending AskFor* before drop: ${hadRequestPreDrop}`)

// Drop A's WS (simulates network loss). asio keeps the player in-game (Run state)
// because B is still present.
console.log('--- dropping A (B stays in-game) ---')
A.ws.close()
await wait(1500)

// A reconnects with the SAME credentials → asio auto-reconnect.
console.log('--- A reconnecting (same creds), logging resent packets ---')
const A2 = client(`rcA_${stamp}`, 'A2')
const reconnected = await until(() =>
  A2.seen.includes('Reconnect') || A2.seen.includes('EnterRoom') || A2.seen.includes('ArrangeSeats'), 12000)
await wait(2500) // let the full resend + request loop re-push settle
const requestResent = A2.seen.some((c) => c.startsWith('AskFor'))
console.log(`A2 (reconnected) full sequence: ${A2.seen.join(',')}`)
console.log(`A2 got a pending AskFor* re-sent after reconnect: ${requestResent}`)
try { A2.ws.close(); B.ws.close() } catch {}

const doneClose = () => { try { A.ws.close(); B.ws.close() } catch {} bridge.close().then(() => process.exit(reconnected ? 0 : 1)) }
console.log(reconnected
  ? `PASS: asio resent room state on reconnect (Reconnect packet). pending-request re-push=${requestResent}. A2 saw: ${[...new Set(A2.seen)].join(',')}`
  : `FAIL: reconnect produced no room bootstrap. A2: ${A2.seen.join(',')}`)
doneClose()
