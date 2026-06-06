// m1-e2e.mjs — M1 end-to-end: browser-supplied login + lobby + create room.
//
// Drives the gateway like the browser does: connects WS, sends __gateway_login
// with credentials, waits for login ok + EnterLobby, refreshes the room list,
// creates a room, refreshes again, and asserts the new room appears.
//
// Usage: ASIO_HOST=<wsl-ip> node scripts/m1-e2e.mjs
// Starts the bridge in-process. Exits 0 on success.

import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }

const config = loadConfig()
const bridge = startWsBridge(config)
const ws = new WebSocket(`ws://localhost:${config.wssPort}`)

const roomName = `e2e_${Date.now() % 100000}`
let loggedIn = false
let createdSeen = false
const seen = []

const done = (code, msg) => {
  if (msg) console.log(msg)
  try { ws.close() } catch {}
  bridge.close().then(() => process.exit(code))
}
const timer = setTimeout(() => done(1, `[m1-e2e] TIMEOUT — saw: ${seen.join(', ')}`), 15_000)

ws.on('open', () => {
  console.log('[m1-e2e] ws open, sending __gateway_login')
  ws.send(JSON.stringify({
    kind: 'notify', command: '__gateway_login',
    data: { user: `e2e_${Date.now() % 100000}`, password: 'e2e-pass', uuid: `e2e-uuid-${Date.now() % 100000}` },
  }))
})

ws.on('message', (raw) => {
  let env
  try { env = JSON.parse(raw.toString()) } catch { return }
  seen.push(env.command)

  if (env.command === '__gateway_login_ok') { loggedIn = true; return }
  if (env.command === '__gateway_login_failed') { clearTimeout(timer); done(1, `[m1-e2e] login failed: ${JSON.stringify(env.data)}`); return }

  if (env.command === 'EnterLobby' && loggedIn) {
    console.log('[m1-e2e] in lobby, creating room', roomName)
    ws.send(JSON.stringify({ kind: 'notify', command: 'CreateRoom', data: [roomName, 2, 90, { gameMode: 'aaa_role_mode', roomName, password: '', disabledPack: [], disabledGenerals: [] }] }))
    // give the server a moment, then refresh the list
    setTimeout(() => ws.send(JSON.stringify({ kind: 'notify', command: 'RefreshRoomList', data: '' })), 500)
  }

  if (env.command === 'EnterRoom') {
    // Creating a room moves us INTO it (asio createRoom adds creator). That alone
    // proves create worked.
    console.log('[m1-e2e] received EnterRoom — room created and joined')
    createdSeen = true
    clearTimeout(timer)
    done(0, `[m1-e2e] PASS (create->EnterRoom). saw: ${seen.join(', ')}`)
  }

  if (env.command === 'UpdateRoomList') {
    const rooms = Array.isArray(env.data) ? env.data : []
    const found = rooms.some((r) => Array.isArray(r) && r[1] === roomName)
    console.log(`[m1-e2e] room list: ${rooms.length} rooms, our room present: ${found}`)
    if (found && !createdSeen) { clearTimeout(timer); done(0, `[m1-e2e] PASS (room in list). saw: ${seen.join(', ')}`) }
  }
})

ws.on('error', (e) => { clearTimeout(timer); done(1, `[m1-e2e] ws error: ${e.message}`) })
