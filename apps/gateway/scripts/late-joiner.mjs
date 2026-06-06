// late-joiner.mjs — reproduces the race: client A creates a room, client B joins
// late. Asserts B (the late joiner) receives an AddPlayer for A. Connects to the
// ALREADY-RUNNING gateway (no in-process bridge). Exits 0 if B sees A.
//
// Usage: node scripts/late-joiner.mjs   (gateway must be running on :9528)

import { WebSocket } from 'ws'

const WSS = 'ws://localhost:9528'
const stamp = Date.now() % 100000
const roomName = `lj_${stamp}`

function client(user) {
  const ws = new WebSocket(WSS)
  const seen = { addPlayers: [], commands: [] }
  const api = { ws, seen, roomId: null }
  ws.on('open', () => ws.send(JSON.stringify({
    kind: 'notify', command: '__gateway_login',
    data: { user, password: 'lj-pass', uuid: `lj-${user}-${stamp}` },
  })))
  ws.on('message', (raw) => {
    let env; try { env = JSON.parse(raw.toString()) } catch { return }
    seen.commands.push(env.command)
    if (env.command === 'AddPlayer' && Array.isArray(env.data)) { const nm=env.data[1]; const str=(nm&&typeof nm==="object")?String.fromCharCode(...Object.values(nm)):String(nm); seen.addPlayers.push(str) }
    if (env.command === 'UpdateRoomList' && Array.isArray(env.data)) {
      const r = env.data.find((x) => Array.isArray(x) && x[1] === roomName)
      if (r) api.roomId = r[0]
    }
    api.onmsg?.(env)
  })
  return api
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 6000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100) }
  return false
}

const A = client(`ljA_${stamp}`)
await until(() => A.seen.commands.includes('__gateway_login_ok'))
await until(() => A.seen.commands.includes('EnterLobby'))
// A creates the room (and is moved into it).
A.ws.send(JSON.stringify({ kind: 'notify', command: 'CreateRoom', data: [roomName, 8, 90, { gameMode: 'aaa_role_mode', roomName, password: '', disabledPack: [], disabledGenerals: [] }] }))
await until(() => A.seen.commands.includes('EnterRoom'))
console.log('[lj] A created+entered room')

// B logs in, finds the room, joins LATE.
const B = client(`ljB_${stamp}`)
await until(() => B.seen.commands.includes('EnterLobby'))
B.ws.send(JSON.stringify({ kind: 'notify', command: 'RefreshRoomList', data: '' }))
const found = await until(() => B.roomId !== null)
if (!found) { console.error('[lj] FAIL: B never saw the room in list'); process.exit(1) }
B.ws.send(JSON.stringify({ kind: 'notify', command: 'EnterRoom', data: [B.roomId, ''] }))
await until(() => B.seen.commands.includes('EnterRoom'))
// Give the late joiner's packets time to flush.
await wait(1500)

// The KEY assertion: B (late joiner) must have received an AddPlayer for A — this
// is what the boot/feed race was dropping.
const bSawA = B.seen.addPlayers.some((n) => n && String(n).includes('ljA_'))
console.log('[lj] B addPlayers seen:', JSON.stringify(B.seen.addPlayers))
console.log('[lj] B commands:', B.seen.commands.join(','))
A.ws.close(); B.ws.close()
if (bSawA) { console.log('[lj] PASS: late joiner B received AddPlayer for A'); process.exit(0) }
console.error('[lj] FAIL: late joiner B did NOT see A'); process.exit(1)
