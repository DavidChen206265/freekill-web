// takeover-ingame-probe.mjs — IG-7 repro for the IN-GAME path (auth.cpp insideGame()
// → reconnect). A and B start a 2-player game; then A2 logs in with A's account while
// A is mid-game. Expected (correct): A is kicked, A2 takes over (gets Reconnect + state
// resync). Bug: A2 gets kicked instead. Uses one bridge; A2 uses a DIFFERENT uuid from
// A (new device mid-game).
// Usage: ASIO_HOST=<wsl-ip> node scripts/takeover-ingame-probe.mjs

import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }
const config = loadConfig()
const bridge = startWsBridge(config)
const stamp = Date.now() % 100000
const roomName = `tkg_${stamp}`
const URL = `ws://localhost:${config.wssPort}`

function client(label, user, uuid) {
  const ws = new WebSocket(URL)
  const seen = []
  const api = { ws, seen, label, user, uuid, roomId: null, kicked: false, closed: false, gotReconnect: false, gotStart: false, closeInfo: '' }
  ws.on('open', () => ws.send(JSON.stringify({ kind: 'notify', command: '__gateway_login', data: { user, password: 'p', uuid } })))
  ws.on('message', (raw) => {
    let env; try { env = JSON.parse(raw.toString()) } catch { return }
    seen.push(env.command)
    if (env.command === 'StartGame') api.gotStart = true
    if (env.command === 'Reconnect') api.gotReconnect = true
    if (env.command === 'ErrorDlg' || env.command === 'ErrorMsg') api.kicked = true
    if (env.command === 'UpdateRoomList' && Array.isArray(env.data)) {
      const r = env.data.find((x) => Array.isArray(x) && x[1] === roomName)
      if (r) api.roomId = r[0]
    }
  })
  ws.on('close', (c, r) => { api.closed = true; api.closeInfo = `${c} ${r}` })
  return api
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100) } return false }
const fin = (code, msg) => { console.log(msg); try { A.ws.close(); B.ws.close(); A2 && A2.ws.close() } catch {} bridge.close().then(() => process.exit(code)) }

const A = client('A', `tkgA_${stamp}`, `tkg-A-${stamp}`)
let A2 = null
await until(() => A.seen.includes('EnterLobby'))
const settings = { gameMode: 'aaa_role_mode', roomName, password: '', _game: { generalNum: 3, generalTimeout: 15, luckTime: 0, enableFreeAssign: false, enableDeputy: false, enableObserverViewCard: false }, _mode: {}, disabledPack: [], disabledGenerals: [] }
A.ws.send(JSON.stringify({ kind: 'notify', command: 'CreateRoom', data: [roomName, 2, 30, settings] }))
if (!await until(() => A.seen.includes('EnterRoom'))) fin(1, '[tkg] FAIL: A no room')

const B = client('B', `tkgB_${stamp}`, `tkg-B-${stamp}`)
await until(() => B.seen.includes('EnterLobby'))
B.ws.send(JSON.stringify({ kind: 'notify', command: 'RefreshRoomList', data: '' }))
if (!await until(() => B.roomId !== null)) fin(1, '[tkg] FAIL: B no room')
B.ws.send(JSON.stringify({ kind: 'notify', command: 'EnterRoom', data: [B.roomId, ''] }))
await until(() => B.seen.includes('EnterRoom'))
await wait(300)
B.ws.send(JSON.stringify({ kind: 'notify', command: 'Ready', data: '' }))
await until(() => A.seen.includes('ReadyChanged') || B.seen.includes('ReadyChanged'))
await wait(300)
A.ws.send(JSON.stringify({ kind: 'notify', command: 'StartGame', data: '' }))
if (!await until(() => A.gotStart && B.gotStart, 12000)) fin(1, '[tkg] FAIL: game did not start')
console.log('[tkg] game started; A is in-game. Now A2 logs in with A\'s account (different uuid)')
await wait(800)

// A2: same account as A, different uuid, while A is mid-game → insideGame()→reconnect.
A2 = client('A2', `tkgA_${stamp}`, `tkg-A2-${stamp}`)
await until(() => A2.gotReconnect || A2.seen.includes('EnterRoom') || A2.closed, 10000)
await wait(2500)

console.log('--- RESULT (in-game takeover) ---')
console.log(`A(old):  kicked=${A.kicked} closed=${A.closed} [${A.closeInfo}]`)
console.log(`A2(new): reconnect=${A2.gotReconnect} kicked=${A2.kicked} closed=${A2.closed} [${A2.closeInfo}]`)
console.log(`A2.seen: ${A2.seen.join(',')}`)
let verdict = 'INCONCLUSIVE'
if ((A2.gotReconnect || A2.seen.includes('EnterRoom')) && !A2.closed && (A.kicked || A.closed)) verdict = 'CORRECT (A2 took over in-game, A kicked)'
else if ((A2.kicked || A2.closed) && !A.closed) verdict = 'BUG REPRODUCED (new A2 kicked, old A survived)'
else if (A2.closed && A.closed) verdict = 'BOTH CLOSED'
console.log(`VERDICT: ${verdict}`)
fin(0, '')
