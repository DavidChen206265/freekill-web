// probe-general.mjs — reproduce the user's scenario: create a 2-player room, add a
// robot, start, and print EVERY command received (to see if AskForGeneral arrives).
import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'

const config = loadConfig()
const bridge = startWsBridge(config)
const stamp = Date.now() % 100000
const roomName = `pg_${stamp}`
const URL = `ws://localhost:${config.wssPort}`

const ws = new WebSocket(URL)
const seen = []
let roomId = null
ws.on('open', () => ws.send(JSON.stringify({ kind: 'notify', command: '__gateway_login', data: { user: `pg_${stamp}`, password: 'p', uuid: `pg-${stamp}` } })))
ws.on('message', (raw) => {
  let env; try { env = JSON.parse(raw.toString()) } catch { return }
  seen.push(env.kind === 'request' ? `${env.command}(REQ#${env.requestId})` : env.command)
  if (env.command === 'AskForGeneral') {
    console.log('\n>>> AskForGeneral RECEIVED! kind:', env.kind, 'requestId:', env.requestId)
    console.log('>>> data:', JSON.stringify(env.data).slice(0, 200), '\n')
  }
})
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100) } return false }

await until(() => seen.includes('EnterLobby'))
ws.send(JSON.stringify({ kind: 'notify', command: 'CreateRoom', data: [roomName, 2, 90, { gameMode: 'aaa_role_mode', roomName, password: '', _game: { generalNum: 3, generalTimeout: 15, luckTime: 0, enableFreeAssign: false, enableDeputy: false, enableObserverViewCard: false }, _mode: {}, disabledPack: [], disabledGenerals: [] }] }))
await until(() => seen.includes('EnterRoom'))
console.log('[pg] created+entered room (lord)')
await wait(300)
ws.send(JSON.stringify({ kind: 'notify', command: 'AddRobot', data: '' }))
await wait(800)
console.log('[pg] after AddRobot, seen has AddPlayer?', seen.includes('AddPlayer'))
ws.send(JSON.stringify({ kind: 'notify', command: 'StartGame', data: '' }))
await until(() => seen.includes('StartGame'), 6000)
await wait(2500) // let post-start packets flow
console.log('\n[pg] full stream after start:')
console.log(seen.join(', '))
console.log('\n[pg] AskForGeneral present?', seen.some((c) => c.startsWith('AskForGeneral')))
ws.close(); await bridge.close(); process.exit(0)
