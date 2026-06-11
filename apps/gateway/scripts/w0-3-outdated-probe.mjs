// w0-3-outdated-probe.mjs — verify invalidateRoomsOnPackageChange=false keeps a
// room from being marked outdated / its players kicked after a server md5 refresh.
//
// Flow: login → create room → go back to lobby → (external: server `disable sp`
// triggers refreshMd5) → refresh room list → assert the room's outdated flag is
// false and we're still connected. Drive the server CLI separately between the
// two phases. Usage: ASIO_HOST=<ip> node scripts/w0-3-outdated-probe.mjs <phase>
//   phase 1: login, create room, print roomId, then keep polling room list and
//            print each room's [id, outdated] until killed.
import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }

const config = loadConfig()
const bridge = startWsBridge(config)
const ws = new WebSocket(`ws://localhost:${config.wssPort}`)
const roomName = `w03_${Date.now() % 100000}`
const t0 = Date.now()
let phase = 'login'
let kicked = false

const send = (command, data) => ws.send(JSON.stringify({ kind: 'notify', command, data }))

ws.on('open', () => {
  send('__gateway_login', { user: `w03_${Date.now() % 100000}`, password: 'p', uuid: `w03-${Date.now() % 100000}` })
})

ws.on('message', (raw) => {
  let env
  try { env = JSON.parse(raw.toString()) } catch { return }
  const { command, data } = env
  if (command === '__gateway_login_ok') return
  if (command === 'EnterLobby' && phase === 'login') {
    phase = 'creating'
    // CreateRoom [name, capacity, timeout, settings] — minimal 2p with _game block.
    send('CreateRoom', [roomName, 2, 90, JSON.stringify({
      _game: { generalNum: 3, luckTime: 0, enableDeputy: false, gameMode: 'aaa_role_mode' },
    })])
    return
  }
  if (command === 'EnterRoom' && phase === 'creating') {
    phase = 'inroom'
    console.log('[w03] room created; leaving to lobby to watch room list')
    send('QuitRoom', '')
    return
  }
  if (command === 'EnterLobby' && phase === 'inroom') {
    phase = 'watching'
    console.log('[w03] back in lobby; polling RefreshRoomList every 2s (issue `disable sp` on the server now)')
    setInterval(() => send('RefreshRoomList', ''), 2000)
    return
  }
  if (command === 'UpdateRoomList' && phase === 'watching') {
    if (Array.isArray(data)) {
      const summary = data.map((r) => Array.isArray(r) ? `#${r[0]}:outdated=${r[6]}` : '?').join(' ')
      console.log(`[w03] room list: ${summary || '(empty)'}`)
    }
  }
  if (command === 'ErrorMsg' || command === 'ErrorDlg') console.log(`[w03] server msg: ${JSON.stringify(data)}`)
})

ws.on('close', () => { kicked = true; console.log(`[w03] @${((Date.now()-t0)/1000).toFixed(1)}s WS CLOSED (kicked?)`) })
ws.on('error', (e) => console.log(`[w03] ws error ${e.message}`))

// keep alive; print a marker so the harness sees liveness
setTimeout(() => { console.log(`[w03] still connected=${!kicked} after 40s`); ws.close(); bridge.close().then(() => process.exit(kicked ? 1 : 0)) }, 40_000)
