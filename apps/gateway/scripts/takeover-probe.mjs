// takeover-probe.mjs — IG-7 reproduction: same account, TWO different uuids (= two
// distinct clients, NOT a refresh), B logs in while A is still online. Observe who
// gets kicked. Expected (correct): A (old) is kicked, B (new) takes over and stays in
// the lobby. The reported bug: B (new) gets kicked instead.
//
// Each client uses a SEPARATE gateway bridge on its own port so they are truly
// independent connections (production = two browsers → same gateway, two asio conns;
// a single bridge with two WS would also work, but separate bridges avoid any shared
// per-bridge park/uuid state masking the asio-level behavior).
// Usage: ASIO_HOST=<wsl-ip> node scripts/takeover-probe.mjs

import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }
const stamp = Date.now() % 100000
const account = `tk_${stamp}`            // SAME account for both clients
const base = loadConfig()

// Two independent bridges on different ports → two independent asio connections.
const cfgA = { ...base, wssPort: base.wssPort }
const cfgB = { ...base, wssPort: base.wssPort + 1 }
const bridgeA = startWsBridge(cfgA)
const bridgeB = startWsBridge(cfgB)

function client(label, port, uuid) {
  const ws = new WebSocket(`ws://localhost:${port}`)
  const seen = []
  const api = { ws, seen, label, kicked: false, kickReason: null, closed: false, enteredLobby: false }
  ws.on('open', () => ws.send(JSON.stringify({ kind: 'notify', command: '__gateway_login', data: { user: account, password: 'p', uuid } })))
  ws.on('message', (raw) => {
    let env; try { env = JSON.parse(raw.toString()) } catch { return }
    seen.push(env.command)
    if (env.command === 'EnterLobby') api.enteredLobby = true
    // asio kicks via ErrorDlg "others logged in again..." then disconnects.
    if (env.command === 'ErrorDlg' || env.command === 'ErrorMsg') { api.kicked = true; api.kickReason = JSON.stringify(env.data).slice(0, 80) }
  })
  ws.on('close', (code, reason) => { api.closed = true; api.closeInfo = `${code} ${reason}` })
  return api
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100) } return false }

const A = client('A(old)', cfgA.wssPort, `tk-A-${stamp}`)  // distinct uuid
await until(() => A.enteredLobby)
console.log(`[tk] A(old) logged in (uuid tk-A), enteredLobby=${A.enteredLobby}`)

// B logs in with the SAME account but a DIFFERENT uuid, while A is still connected.
const B = client('B(new)', cfgB.wssPort, `tk-B-${stamp}`)  // distinct uuid
await until(() => B.enteredLobby || B.closed, 8000)
console.log(`[tk] B(new) login: enteredLobby=${B.enteredLobby} closed=${B.closed}`)

// Give asio a moment to deliver the kick to whichever side it kicks.
await wait(2500)

console.log('--- RESULT ---')
console.log(`A(old): enteredLobby=${A.enteredLobby} kicked=${A.kicked}${A.kickReason ? ` (${A.kickReason})` : ''} closed=${A.closed}${A.closeInfo ? ` [${A.closeInfo}]` : ''}`)
console.log(`B(new): enteredLobby=${B.enteredLobby} kicked=${B.kicked}${B.kickReason ? ` (${B.kickReason})` : ''} closed=${B.closed}${B.closeInfo ? ` [${B.closeInfo}]` : ''}`)
console.log(`A.seen: ${A.seen.join(',')}`)
console.log(`B.seen: ${B.seen.join(',')}`)

// Verdict: correct = A kicked/closed & B alive in lobby; bug = B kicked/closed & A alive.
let verdict = 'INCONCLUSIVE'
if (B.enteredLobby && !B.closed && (A.kicked || A.closed)) verdict = 'CORRECT (new takes over, old kicked)'
else if ((B.kicked || B.closed) && !A.closed) verdict = 'BUG REPRODUCED (new got kicked, old survived)'
else if (B.closed && A.closed) verdict = 'BOTH CLOSED (deadlock-ish?)'
console.log(`VERDICT: ${verdict}`)

try { A.ws.close(); B.ws.close() } catch {}
await Promise.all([bridgeA.close(), bridgeB.close()])
process.exit(0)
