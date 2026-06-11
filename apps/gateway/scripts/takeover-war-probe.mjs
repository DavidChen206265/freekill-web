// takeover-war-probe.mjs — IG-7 hypothesis: the REAL web client auto-reconnects when
// its WS is kicked. So when B takes over A's in-game session (A kicked), A's browser
// auto-reconnects → re-login same account → kicks B → B auto-reconnects → kicks A → …
// a TAKEOVER WAR. The in-game client (A) has state so its reconnects are seamless
// ("undisturbed"); the newcomer (B) has none so it shows a "正在重连" loop. This probe
// makes BOTH sides auto-reconnect on close (like useConnectionStore.scheduleReconnect)
// and watches whether the connection thrashes.
// Usage: ASIO_HOST=<wsl-ip> node scripts/takeover-war-probe.mjs

import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }
const config = loadConfig()
const bridge = startWsBridge(config)
const stamp = Date.now() % 100000
const roomName = `tkw_${stamp}`
const URL = `ws://localhost:${config.wssPort}`

// A client that AUTO-RECONNECTS on close (mirrors the real web client), keeping its
// account + uuid. Tracks login count, room/lobby/reconnect events.
// `honorKick`: emulate the IG-7 FIX — on a duplicate-login ErrorDlg, stop reconnecting.
function autoClient(label, user, uuid, autoReconnect, honorKick = false) {
  const st = { label, user, uuid, logins: 0, kicks: 0, reconnectCmds: 0, enterRoom: 0, enterLobby: 0, lastState: '', ws: null, stop: false, kickedOff: false }
  const connect = () => {
    if (st.stop || st.kickedOff) return
    st.logins++
    const ws = new WebSocket(URL); st.ws = ws
    ws.on('open', () => ws.send(JSON.stringify({ kind: 'notify', command: '__gateway_login', data: { user, password: 'p', uuid } })))
    ws.on('message', (raw) => {
      let e; try { e = JSON.parse(raw.toString()) } catch { return }
      if (e.command === 'EnterRoom') { st.enterRoom++; st.lastState = 'room' }
      if (e.command === 'EnterLobby') { st.enterLobby++; st.lastState = 'lobby' }
      if (e.command === 'Reconnect') st.reconnectCmds++
      if (e.command === 'ErrorDlg' || e.command === 'ErrorMsg') {
        st.kicks++
        // IG-7 fix: a duplicate-login kick stops this client from reconnecting.
        if (honorKick && String(e.data).includes('others logged in again with this name')) { st.kickedOff = true; st.lastState = 'kicked-off' }
      }
      if (e.command === 'UpdateRoomList' && Array.isArray(e.data)) {
        const r = e.data.find((x) => Array.isArray(x) && x[1] === roomName)
        if (r) st.roomId = r[0]
      }
    })
    ws.on('close', () => { if (autoReconnect && !st.stop && !st.kickedOff) setTimeout(connect, 300) }) // mirror web backoff
    ws.on('error', () => {})
  }
  connect()
  return st
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100) } return false }

// A: in-game, auto-reconnects on kick BUT honors the IG-7 fix (stops on dup-login kick).
const A = autoClient('A', `tkwA_${stamp}`, `tkw-A-${stamp}`, true, true)
await until(() => A.lastState === 'lobby')
A.ws.send(JSON.stringify({ kind: 'notify', command: 'CreateRoom', data: [roomName, 2, 30, { gameMode: 'aaa_role_mode', roomName, password: '', _game: { generalNum: 3, generalTimeout: 15, luckTime: 0, enableFreeAssign: false, enableDeputy: false, enableObserverViewCard: false }, _mode: {}, disabledPack: [], disabledGenerals: [] }] }))
await until(() => A.lastState === 'room')
// B (bot stand-in): a second real account to fill + start the game.
const B = autoClient('B', `tkwB_${stamp}`, `tkw-B-${stamp}`, false)
await until(() => B.lastState === 'lobby')
B.ws.send(JSON.stringify({ kind: 'notify', command: 'RefreshRoomList', data: '' }))
await until(() => B.roomId != null)
B.ws.send(JSON.stringify({ kind: 'notify', command: 'EnterRoom', data: [B.roomId, ''] }))
await until(() => B.lastState === 'room')
await wait(300); B.ws.send(JSON.stringify({ kind: 'notify', command: 'Ready', data: '' }))
await wait(500); A.ws.send(JSON.stringify({ kind: 'notify', command: 'StartGame', data: '' }))
await wait(1500)
console.log(`[tkw] game started. A logins=${A.logins} state=${A.lastState}`)

// NOW: A2 logs in with A's SAME account (a new device), and ALSO auto-reconnects.
const A2 = autoClient('A2', `tkwA_${stamp}`, `tkw-A2-${stamp}`, true, true)
// Watch for ~8s: does it settle, or do A and A2 thrash (login counts keep climbing)?
const t0 = Date.now()
const snaps = []
while (Date.now() - t0 < 8000) {
  await wait(1000)
  snaps.push(`A.logins=${A.logins}(${A.lastState}) A2.logins=${A2.logins}(${A2.lastState})`)
}
A.stop = B.stop = A2.stop = true
try { A.ws.close(); B.ws.close(); A2.ws.close() } catch {}

console.log('--- WAR WATCH (1s snapshots) ---')
snaps.forEach((s, i) => console.log(`  t+${i + 1}s: ${s}`))
const thrash = A.logins > 4 && A2.logins > 4
console.log(`A: total logins=${A.logins} reconnectCmds=${A.reconnectCmds} kicks=${A.kicks} final=${A.lastState} kickedOff=${A.kickedOff}`)
console.log(`A2: total logins=${A2.logins} reconnectCmds=${A2.reconnectCmds} kicks=${A2.kicks} final=${A2.lastState} kickedOff=${A2.kickedOff}`)
let verdict
if (thrash) verdict = 'TAKEOVER WAR (both keep re-logging) — BUG'
else if (A.kickedOff && !A2.kickedOff && A2.lastState === 'room') verdict = 'FIXED (A2 took over the game, A stopped reconnecting after the kick)'
else if (A2.kickedOff && !A.kickedOff) verdict = 'FIXED (A kept the game, A2 stopped after the kick)'
else verdict = `settled (A=${A.lastState}, A2=${A2.lastState})`
console.log(`VERDICT: ${verdict}`)

await bridge.close(); process.exit(0)
