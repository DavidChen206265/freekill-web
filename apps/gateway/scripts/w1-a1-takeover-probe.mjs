// w1-a1-takeover-probe.mjs — verify same-account re-login in the LOBBY takes over
// the old session (old disconnected, new reaches lobby) instead of deadlocking.
//
// Two WS clients through one in-process bridge, same user/password/different uuid.
// Client A logs in, reaches lobby. Then Client B logs in with the SAME account.
// Expect: B reaches EnterLobby (login OK), A's socket gets closed. Neither hangs.
// Usage: ASIO_HOST=<ip> node scripts/w1-a1-takeover-probe.mjs
import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }
const config = loadConfig()
const bridge = startWsBridge(config)

const acct = `a1_${Date.now() % 100000}`
const password = 'p'
const mk = (uuid) => new WebSocket(`ws://localhost:${config.wssPort}`)

let aClosed = false, aLobby = false, bLobby = false
const log = (...x) => console.log(...x)

const finish = (code, msg) => {
  log(msg)
  try { a.close(); b.close() } catch {}
  bridge.close().then(() => process.exit(code))
}
const timer = setTimeout(() => finish(1, `[a1] TIMEOUT aLobby=${aLobby} bLobby=${bLobby} aClosed=${aClosed}`), 25_000)

const a = mk()
let b
a.on('open', () => { log('[a1] A connecting'); a.send(JSON.stringify({ kind: 'notify', command: '__gateway_login', data: { user: acct, password, uuid: `a1-A-${Date.now()}` } })) })
a.on('message', (raw) => {
  let env; try { env = JSON.parse(raw.toString()) } catch { return }
  if (env.command === 'EnterLobby' && !aLobby) {
    aLobby = true; log('[a1] A in lobby; now connecting B (same account)')
    b = mk()
    b.on('open', () => b.send(JSON.stringify({ kind: 'notify', command: '__gateway_login', data: { user: acct, password, uuid: `a1-B-${Date.now()}` } })))
    b.on('message', (raw2) => {
      let e2; try { e2 = JSON.parse(raw2.toString()) } catch { return }
      if (e2.command === '__gateway_login_failed') return finish(1, `[a1] FAIL: B login rejected ${JSON.stringify(e2.data)}`)
      if (e2.command === 'EnterLobby' && !bLobby) {
        bLobby = true; log('[a1] B in lobby ✓')
        // give A a moment to be disconnected by the takeover
        setTimeout(() => {
          clearTimeout(timer)
          if (bLobby && aClosed) finish(0, '[a1] PASS — B took over, A disconnected, no deadlock')
          else finish(1, `[a1] PARTIAL — bLobby=${bLobby} aClosed=${aClosed} (A should have been kicked)`)
        }, 2500)
      }
    })
    b.on('error', (e) => finish(1, `[a1] B ws error ${e.message}`))
  }
})
a.on('close', () => { aClosed = true; log('[a1] A socket CLOSED (kicked by takeover) ✓') })
a.on('error', (e) => log(`[a1] A ws error ${e.message}`))
