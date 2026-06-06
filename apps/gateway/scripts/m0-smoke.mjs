// m0-smoke.mjs — end-to-end M0 smoke test.
//
// Starts the WSS bridge (in-process) and connects a minimal browser-like WS
// client through it, proving: browser --WSS--> gateway --TCP--> asio login works
// and lobby envelopes flow back to the browser.
//
// Usage: ASIO_HOST=<wsl-ip> node scripts/m0-smoke.mjs
// Exits 0 on success (saw __gateway_login_ok + EnterLobby), 1 otherwise.

import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) {
  console.error('ASIO_HOST not set — get it via: wsl -d Ubuntu -- hostname -I')
  process.exit(2)
}

const config = loadConfig()
const bridge = startWsBridge(config)

const seen = []
let loginOk = false
let sawLobby = false

const ws = new WebSocket(`ws://localhost:${config.wssPort}`)

const done = (code) => {
  try { ws.close() } catch {}
  bridge.close().then(() => process.exit(code))
}

const timer = setTimeout(() => {
  console.error('[smoke] TIMEOUT — commands seen:', seen.join(', '))
  done(1)
}, 12_000)

ws.on('open', () => console.log('[smoke] ws connected to gateway'))

ws.on('message', (raw) => {
  let env
  try { env = JSON.parse(raw.toString()) } catch { return }
  seen.push(env.command)
  if (env.command === '__gateway_login_ok') { loginOk = true; console.log('[smoke] login OK:', JSON.stringify(env.data)) }
  if (env.command === '__gateway_login_failed') { console.error('[smoke] login FAILED:', JSON.stringify(env.data)); clearTimeout(timer); done(1) }
  if (env.command === 'EnterLobby') sawLobby = true
  if (loginOk && sawLobby) {
    clearTimeout(timer)
    console.log('[smoke] PASS — commands:', seen.join(', '))
    done(0)
  }
})

ws.on('error', (e) => { console.error('[smoke] ws error', e.message); clearTimeout(timer); done(1) })
