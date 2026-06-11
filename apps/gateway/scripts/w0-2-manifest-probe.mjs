// w0-2-manifest-probe.mjs — verify SetServerSettings carries the W0-2 Web manifest.
//
// Connects through the gateway, captures the SetServerSettings envelope, and
// asserts data[3] is the manifest object with enabledPacks (incl builtins +
// extensions) and assetVersion. Usage: ASIO_HOST=<wsl-ip> node scripts/w0-2-manifest-probe.mjs
import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }

const config = loadConfig()
const bridge = startWsBridge(config)
const ws = new WebSocket(`ws://localhost:${config.wssPort}`)
const seen = []

const done = (code, msg) => {
  if (msg) console.log(msg)
  try { ws.close() } catch {}
  bridge.close().then(() => process.exit(code))
}
const timer = setTimeout(() => done(1, `[probe] TIMEOUT — saw: ${seen.join(', ')}`), 15_000)

ws.on('open', () => {
  ws.send(JSON.stringify({
    kind: 'notify', command: '__gateway_login',
    data: { user: `probe_${Date.now() % 100000}`, password: 'p', uuid: `probe-uuid-${Date.now() % 100000}` },
  }))
})

ws.on('message', (raw) => {
  let env
  try { env = JSON.parse(raw.toString()) } catch { return }
  seen.push(env.command)
  if (env.command !== 'SetServerSettings') return
  clearTimeout(timer)
  const data = env.data
  console.log('[probe] SetServerSettings raw:', JSON.stringify(data))
  if (!Array.isArray(data)) return done(1, '[probe] FAIL: data not an array')
  if (data.length < 4) return done(1, `[probe] FAIL: expected >=4 elements, got ${data.length}`)
  const manifest = data[3]
  console.log('[probe] manifest:', JSON.stringify(manifest, null, 2))
  const packs = manifest?.enabledPacks
  const ok =
    manifest && typeof manifest === 'object' &&
    Array.isArray(packs) &&
    ['standard', 'standard_cards', 'maneuvering'].every((p) => packs.includes(p)) &&
    typeof manifest.assetVersion === 'string' && manifest.assetVersion.length > 0 &&
    typeof manifest.serverBuild === 'string'
  if (!ok) return done(1, '[probe] FAIL: manifest shape/contents wrong')
  console.log(`[probe] PASS — enabledPacks=[${packs.join(', ')}] assetVersion=${manifest.assetVersion} build=${manifest.serverBuild} webOnly=${manifest.webOnly} features=[${(manifest.webFeatures||[]).join(',')}]`)
  done(0)
})

ws.on('error', (e) => { clearTimeout(timer); done(1, `[probe] ws error ${e.message}`) })
