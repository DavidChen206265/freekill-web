// Verifies a shzl general can be selected through free assign without the server
// crashing to GameOver. Usage:
//   ASIO_HOST=<wsl-ip> node scripts/shzl-freeassign-probe.mjs

import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }
const config = loadConfig()
const bridge = startWsBridge(config)
const stamp = Date.now() % 100000
const roomName = `shzl_${stamp}`
const URL = `ws://localhost:${config.wssPort}`

function client(user, preferredGeneral = '') {
  const ws = new WebSocket(URL)
  const api = { ws, seen: [], roomId: null, pickedPreferred: false, gameOver: false, askCount: 0 }
  ws.on('open', () => ws.send(JSON.stringify({
    kind: 'notify',
    command: '__gateway_login',
    data: { user, password: 'p', uuid: `shzl-${user}-${stamp}` },
  })))
  ws.on('message', (raw) => {
    let env; try { env = JSON.parse(raw.toString()) } catch { return }
    api.seen.push(env.command)
    if (env.command === 'GameOver') api.gameOver = true
    if (env.command === 'UpdateRoomList' && Array.isArray(env.data)) {
      const r = env.data.find((x) => Array.isArray(x) && x[1] === roomName)
      if (r) api.roomId = r[0]
    }
    if (env.kind === 'request' && env.command === 'AskForGeneral' && Array.isArray(env.data)) {
      const offered = Array.isArray(env.data[0]) ? env.data[0].map(bytesToStr).filter(Boolean) : []
      const n = Number(env.data[1]) || 1
      const chosen = preferredGeneral && !api.pickedPreferred
        ? [preferredGeneral]
        : offered.slice(0, Math.max(1, n))
      api.pickedPreferred = api.pickedPreferred || chosen.includes(preferredGeneral)
      api.askCount += 1
      ws.send(JSON.stringify({ kind: 'reply', requestId: env.requestId, command: '', data: chosen }))
    }
  })
  return api
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
function bytesToStr(v) {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const codes = Array.isArray(v) ? v : Object.keys(v).filter((k) => /^\d+$/.test(k)).sort((a, b) => a - b).map((k) => v[k])
    if (codes.length && codes.every((c) => typeof c === 'number')) return String.fromCharCode(...codes)
  }
  return ''
}
const until = async (fn, ms = 8000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100) }
  return false
}
let doneCalled = false
const done = (code, msg) => {
  if (doneCalled) return
  doneCalled = true
  console.log(msg)
  try { A.ws.close(); B.ws.close() } catch {}
  bridge.close().finally(() => process.exit(code))
}

const A = client(`shzlA_${stamp}`, 'xiahouyuan')
await until(() => A.seen.includes('EnterLobby'))
const settings = {
  gameMode: 'aaa_role_mode', roomName, password: '',
  _game: {
    generalNum: 3,
    generalTimeout: 15,
    luckTime: 0,
    enableFreeAssign: true,
    freeAssignRespectBan: false,
    enableDeputy: false,
    enableObserverViewCard: false,
  },
  _mode: {},
  disabledPack: [],
  disabledGenerals: [],
}
A.ws.send(JSON.stringify({ kind: 'notify', command: 'CreateRoom', data: [roomName, 2, 30, settings] }))
if (!await until(() => A.seen.includes('EnterRoom'))) done(1, '[shzl] FAIL: A did not enter room')

const B = client(`shzlB_${stamp}`)
await until(() => B.seen.includes('EnterLobby'))
B.ws.send(JSON.stringify({ kind: 'notify', command: 'RefreshRoomList', data: '' }))
if (!await until(() => B.roomId !== null)) done(1, '[shzl] FAIL: B never saw room')
B.ws.send(JSON.stringify({ kind: 'notify', command: 'EnterRoom', data: [B.roomId, ''] }))
if (!await until(() => B.seen.includes('EnterRoom'))) done(1, '[shzl] FAIL: B did not enter room')

await wait(300)
B.ws.send(JSON.stringify({ kind: 'notify', command: 'Ready', data: '' }))
await until(() => B.seen.includes('ReadyChanged') || A.seen.includes('ReadyChanged'))
await wait(300)
A.ws.send(JSON.stringify({ kind: 'notify', command: 'StartGame', data: '' }))

if (!await until(() => A.pickedPreferred, 12000)) {
  done(1, `[shzl] FAIL: xiahouyuan was not replied through AskForGeneral.\nA: ${A.seen.join(',')}`)
}

await wait(8000)
if (A.gameOver || B.gameOver) {
  done(1, `[shzl] FAIL: GameOver arrived after selecting xiahouyuan.\nA: ${A.seen.join(',')}\nB: ${B.seen.join(',')}`)
}

done(0, `[shzl] PASS: selected xiahouyuan and no GameOver for 8s after general replies. A asks=${A.askCount} B asks=${B.askCount}`)
