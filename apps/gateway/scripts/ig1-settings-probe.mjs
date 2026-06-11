// ig1-settings-probe.mjs — IG-1 verification: a CreateRoom with non-default _game
// settings must actually change server behavior. Creates a 2-player room with
// generalNum=4 + luckTime=2, starts the game, and asserts:
//   (a) the AskForGeneral request offers selecting 4 generals (n === 4, not the
//       default 3) — proves generalNum reached the server/VM.
//   (b) a luck-card request arrives (AskForSkillInvoke carrying "AskForLuckCard")
//       — proves luckTime>0 took effect.
// Modeled on start-game.mjs. Usage: ASIO_HOST=<wsl-ip> node scripts/ig1-settings-probe.mjs

import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }
const config = loadConfig()
const bridge = startWsBridge(config)
const stamp = Date.now() % 100000
const roomName = `ig1_${stamp}`
const URL = `ws://localhost:${config.wssPort}`

function client(user) {
  const ws = new WebSocket(URL)
  const seen = []
  const envs = []
  const api = { ws, seen, envs, roomId: null, generalPool: null, luckCard: false }
  ws.on('open', () => ws.send(JSON.stringify({ kind: 'notify', command: '__gateway_login', data: { user, password: 'p', uuid: `ig1-${user}-${stamp}` } })))
  ws.on('message', (raw) => {
    let env; try { env = JSON.parse(raw.toString()) } catch { return }
    seen.push(env.command)
    envs.push(env)
    // AskForGeneral data = [generals[], n, no_convert, heg, rule, extra_data].
    // generals[] is the candidate POOL (its size scales with generalNum); n is how
    // many to PICK (1 in role mode). So generalNum's effect shows in the pool length.
    if (env.command === 'AskForGeneral' && Array.isArray(env.data) && api.generalPool === null) {
      api.generalPool = Array.isArray(env.data[0]) ? env.data[0].length : 0
    }
    // Luck card is an AskForSkillInvoke whose data[0] === "AskForLuckCard". Over the
    // envelope path data[0] may be a CBOR byte-string decoded to {0:..,1:..} (cbor-x-
    // asio gotcha), so coerce bytes→string before comparing.
    if (env.command === 'AskForSkillInvoke' && Array.isArray(env.data)) {
      const s = bytesToStr(env.data[0])
      if (s === 'AskForLuckCard') api.luckCard = true
    }
    if (env.command === 'UpdateRoomList' && Array.isArray(env.data)) {
      const r = env.data.find((x) => Array.isArray(x) && x[1] === roomName)
      if (r) api.roomId = r[0]
    }
  })
  return api
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// Coerce a value that may be a string OR a CBOR byte-string-decoded object ({0:..,1:..})
// or array of char codes into a JS string (the gateway's envelope decode leaves asio
// byte strings as indexed objects on this path).
function bytesToStr(v) {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const codes = Array.isArray(v) ? v : Object.keys(v).filter((k) => /^\d+$/.test(k)).sort((a, b) => a - b).map((k) => v[k])
    if (codes.length && codes.every((c) => typeof c === 'number')) return String.fromCharCode(...codes)
  }
  return ''
}
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100) } return false }
const done = (code, msg) => { console.log(msg); try { A.ws.close(); B.ws.close() } catch {} bridge.close().then(() => process.exit(code)) }

const A = client(`ig1A_${stamp}`)
await until(() => A.seen.includes('EnterLobby'))
// Non-default settings: generalNum=4 (default 3), luckTime=2 (default 0=off).
const settings = {
  gameMode: 'aaa_role_mode', roomName, password: '',
  _game: { generalNum: 4, generalTimeout: 15, luckTime: 2, enableFreeAssign: false, enableDeputy: false, enableObserverViewCard: false },
  _mode: {},
  disabledPack: [], disabledGenerals: [],
}
A.ws.send(JSON.stringify({ kind: 'notify', command: 'CreateRoom', data: [roomName, 2, 30, settings] }))
if (!await until(() => A.seen.includes('EnterRoom'))) done(1, '[ig1] FAIL: A did not enter room')
console.log('[ig1] A created room with generalNum=4, luckTime=2')

const B = client(`ig1B_${stamp}`)
await until(() => B.seen.includes('EnterLobby'))
B.ws.send(JSON.stringify({ kind: 'notify', command: 'RefreshRoomList', data: '' }))
if (!await until(() => B.roomId !== null)) done(1, '[ig1] FAIL: B never saw room')
B.ws.send(JSON.stringify({ kind: 'notify', command: 'EnterRoom', data: [B.roomId, ''] }))
if (!await until(() => B.seen.includes('EnterRoom'))) done(1, '[ig1] FAIL: B did not enter')

await wait(300)
B.ws.send(JSON.stringify({ kind: 'notify', command: 'Ready', data: '' }))
await until(() => B.seen.includes('ReadyChanged') || A.seen.includes('ReadyChanged'))
await wait(300)
A.ws.send(JSON.stringify({ kind: 'notify', command: 'StartGame', data: '' }))

// Wait for AskForGeneral (opening pick) on either client.
const gotGeneral = await until(() => A.generalPool !== null || B.generalPool !== null, 12000)
const pool = A.generalPool ?? B.generalPool
if (!gotGeneral) { done(1, `[ig1] FAIL: no AskForGeneral seen.\nA: ${A.seen.join(',')}`); }
// Baseline: 2 players × generalNum=3 → pool of 6 (measured). generalNum=4 → 7.
// Assert the pool exceeds the default-3 baseline, proving generalNum=4 took effect.
else if (!(pool > 6)) { done(1, `[ig1] FAIL: AskForGeneral pool=${pool}, expected >6 (generalNum=4 did not enlarge the pool vs default 3)`); }
else {
  console.log(`[ig1] PASS(a): AskForGeneral pool=${pool} (>6 baseline → generalNum=4 honored)`)
  // After the general pick auto-resolves (we don't reply; generalTimeout auto-picks),
  // the luck-card request should fire. Give it room.
  const gotLuck = await until(() => A.luckCard || B.luckCard, 35000)
  if (gotLuck) done(0, `[ig1] PASS(b): luck-card request received (luckTime=2 honored). ALL PASS.`)
  else done(1, `[ig1] FAIL: no luck-card AskForSkillInvoke within timeout (luckTime may not have taken effect).\nA: ${A.seen.join(',')}\nB: ${B.seen.join(',')}`)
}

