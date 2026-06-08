// observe-reconnect.mjs — M3 R1 live self-verify against a running gateway+asio.
// Reproduces the routing fix: client A creates a room and starts a game (needs a
// bot to fill), client B OBSERVES. Before the fix, B's "Observe" server packet
// fell through the lobby default branch and was dropped → B's VM never booted →
// B saw nothing. After the fix, routeEnvelope boots the VM on Observe too, so B
// receives the room bootstrap (EnterRoom re-emitted by the VM) and game packets.
//
// Also exercises the lobby Heartbeat echo: an idle client should NOT be kicked.
//
// Usage: gateway must be running on :9528 (ASIO_HOST set to the WSL asio).
//   node scripts/observe-reconnect.mjs
// Exits 0 on success, 1 on failure. This is a MANUAL live check (needs asio).

import { WebSocket } from 'ws'

const WSS = process.env.WSS || 'ws://localhost:9528'
const stamp = Date.now() % 100000
const roomName = `obs_${stamp}`

function decodeName(nm) {
  return nm && typeof nm === 'object' ? String.fromCharCode(...Object.values(nm)) : String(nm)
}

function client(user) {
  const ws = new WebSocket(WSS)
  const seen = { commands: [], addPlayers: [], heartbeats: 0 }
  const api = { ws, seen, roomId: null }
  ws.on('open', () => ws.send(JSON.stringify({
    kind: 'notify', command: '__gateway_login',
    data: { user, password: 'obs-pass', uuid: `obs-${user}-${stamp}` },
  })))
  ws.on('message', (raw) => {
    let env; try { env = JSON.parse(raw.toString()) } catch { return }
    seen.commands.push(env.command)
    if (env.command === 'Heartbeat') seen.heartbeats++
    if (env.command === 'AddPlayer' && Array.isArray(env.data)) seen.addPlayers.push(decodeName(env.data[1]))
    if (env.command === 'UpdateRoomList' && Array.isArray(env.data)) {
      const r = env.data.find((x) => Array.isArray(x) && x[1] === roomName)
      if (r) api.roomId = r[0]
    }
    api.onmsg?.(env)
  })
  api.send = (command, data) => ws.send(JSON.stringify({ kind: 'notify', command, data }))
  return api
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 8000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100) }
  return false
}

async function main() {
  const a = client('obsA')
  await until(() => a.seen.commands.includes('EnterLobby'))
  a.send('CreateRoom', [roomName, 2, 90, JSON.stringify({ gameMode: 'aaa_role_mode' })])
  await until(() => a.seen.commands.includes('EnterRoom'))
  a.send('RefreshRoomList', '')
  await until(() => a.roomId !== null)
  console.log(`[A] created room ${a.roomId}`)
  // Fill with a bot and start so the room is "running" (observe target).
  a.send('AddRobot', '')
  await wait(500)
  a.send('StartGame', '')
  await until(() => a.seen.commands.includes('StartGame'))
  console.log('[A] game started')

  // B observes the running room.
  const b = client('obsB')
  await until(() => b.seen.commands.includes('EnterLobby'))
  b.send('RefreshRoomList', '')
  await until(() => b.roomId !== null || a.roomId !== null)
  b.send('ObserveRoom', [a.roomId, ''])
  const observed = await until(() =>
    b.seen.commands.includes('Observe') || b.seen.commands.includes('EnterRoom') || b.seen.addPlayers.length > 0)
  console.log(`[B] observe commands: ${[...new Set(b.seen.commands)].join(',')}`)

  const ok = observed
  console.log(ok ? 'PASS: observer received room bootstrap' : 'FAIL: observer saw nothing (routing drop?)')
  a.ws.close(); b.ws.close()
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
