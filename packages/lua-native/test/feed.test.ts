// feed.test.ts — feed real captured server packets into the booted client VM and
// assert it expands them into notifyUI deltas. This mirrors the browser M2 path
// (envelope.raw -> ClientCallback) but runs in Node with fs-mounted core.
//
// Uses the spike's captured-packets.json (real asio packet stream). Skipped if
// the upstream core tree isn't present.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LuaFactory } from 'wasmoon'
import { createNatives, bootClient } from '../src/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..', '..', '..', '..')
const CORE = path.join(REPO, 'FreeKill-release', 'packages', 'freekill-core')
const PRELUDE = path.join(__dirname, '..', 'lua', 'fkprelude.lua')
const CAPTURED = path.join(REPO, 'freekill-web-spike', 'captured-packets.json')

const VFS_CORE = '/fk/packages/freekill-core'
const EXTS = new Set(['.lua', '.json', '.txt'])
const ready = fs.existsSync(CORE) && fs.existsSync(CAPTURED)

function collect(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n)
      fs.statSync(f).isDirectory() ? walk(f) : EXTS.has(path.extname(n)) && out.push(f)
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return out
}

describe('client VM packet feed', () => {
  it.skipIf(!ready)('expands a real captured packet stream into notifyUI deltas', async () => {
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        const rel = path.relative(CORE, full).replace(/\\/g, '/')
        factory.mountFileSync(luaModule, `${VFS_CORE}/${rel}`, fs.readFileSync(full))
      }
    }
    const feed: Array<{ command: string; data: unknown }> = []
    const natives = createNatives({
      emfs: FS as never,
      onNotifyUI: (e) => feed.push(e),
      log: () => {},
    })
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives, preludeLua: fs.readFileSync(PRELUDE, 'utf8') })

    // Enter a room + add players (so the captured stream has a room to apply to).
    lua.global.set('__setup', JSON.stringify({ gameMode: 'aaa_role_mode', disabledPack: [], disabledGenerals: [] }))
    await lua.doString(`
      ClientCallback(ClientInstance, "EnterRoom", cbor.encode({ 2, 15, json.decode(__setup) }), false)
      ClientCallback(ClientInstance, "AddPlayer", cbor.encode({ 2, "Bob", "liubei", true }), false)
    `)

    // Feed player-1's captured packet stream via the raw-CBOR path.
    const packets: Array<{ to: number; command: string; dataHex: string; kind: string }> =
      JSON.parse(fs.readFileSync(CAPTURED, 'utf8'))
    const stream = packets.filter((p) => p.to === 1)
    lua.global.set('__cmds', stream.map((p) => p.command))
    lua.global.set('__hex', stream.map((p) => p.dataHex))
    lua.global.set('__req', stream.map((p) => p.kind === 'request'))
    const processed = await lua.doString(`
      local function fromHex(h) return (h:gsub("..", function(cc) return string.char(tonumber(cc,16)) end)) end
      local ok = 0
      for i = 1, #__cmds do
        if pcall(ClientCallback, ClientInstance, __cmds[i], fromHex(__hex[i] or ""), __req[i] == true) then ok = ok + 1 end
      end
      return ok
    `)

    expect(processed).toBeGreaterThan(100)
    expect(feed.length).toBeGreaterThan(50)
    // The hallmark in-game deltas the table UI will consume.
    const moveEvents = feed.filter((e) => e.command === 'MoveCards') as Array<{ command: string; data: { merged?: Array<{ ids: number[]; fromArea: number; toArea: number }> } }>
    expect(moveEvents.length).toBeGreaterThan(0)
    // Verify the `merged` contract the cardStore reducer relies on (RoomLogic
    // moveCards shape): each MoveCards carries merged[] with ids/fromArea/toArea.
    const withMerged = moveEvents.filter((e) => Array.isArray(e.data?.merged) && e.data.merged.length > 0)
    expect(withMerged.length).toBeGreaterThan(0)
    const sampleMove = withMerged[0]!.data.merged![0]!
    expect(Array.isArray(sampleMove.ids)).toBe(true)
    expect(typeof sampleMove.fromArea).toBe('number')
    expect(typeof sampleMove.toArea).toBe('number')
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('Setup overwrites the placeholder self; getDisabledPacks is config-driven', async () => {
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        const rel = path.relative(CORE, full).replace(/\\/g, '/')
        factory.mountFileSync(luaModule, `${VFS_CORE}/${rel}`, fs.readFileSync(full))
      }
    }
    const natives = createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {}, disabledPacks: ['foo', 'bar'] })
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives, preludeLua: fs.readFileSync(PRELUDE, 'utf8') })

    // A1: getDisabledPacks reflects the injected config, not a hardcoded [].
    const disabled = await lua.doString('return fk.GetDisabledPacks()')
    expect(JSON.parse(disabled as string)).toEqual(['foo', 'bar'])

    // A4: before Setup, self is an obvious placeholder (empty name), not "Tester".
    const beforeName = await lua.doString('return ClientInstance.client:getSelf():getScreenName()')
    expect(beforeName).toBe('')

    // Setup must set the real identity.
    await lua.doString(`ClientCallback(ClientInstance,"Setup",cbor.encode({7,"webtester","liubei",0}),false)`)
    const after = await lua.doString('return Self.id .. "|" .. ClientInstance.client:getSelf():getScreenName()')
    expect(after).toBe('7|webtester')
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('play→reply loop: select slash → target → OK emits ReplyToServer', async () => {
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const replies: unknown[] = []
    const natives = createNatives({
      emfs: FS as never, log: () => {},
      onNotifyUI: (e) => { if (e.command === 'ReplyToServer') replies.push(e.data) },
    })
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives, preludeLua: fs.readFileSync(PRELUDE, 'utf8') })

    // Set up a started room with Self holding a Slash in the Play phase, then fire
    // the PlayCard request — exactly the ui_emu local loop the web client drives.
    lua.global.set('__setup', JSON.stringify({ gameMode: 'aaa_role_mode', disabledPack: [], disabledGenerals: [] }))
    const slashId = await lua.doString(`
      ClientCallback(ClientInstance, "Setup", cbor.encode({1, "me", "caocao", 0}), false)
      ClientCallback(ClientInstance, "EnterRoom", cbor.encode({2, 15, json.decode(__setup)}), false)
      ClientCallback(ClientInstance, "AddPlayer", cbor.encode({2, "foe", "zhangfei", true}), false)
      Self.general="caocao"; Self.maxHp=4; Self.hp=4; Self.kingdom="wei"; Self.role="lord"; Self.dead=false
      for _, p in ipairs(ClientInstance.players) do
        p.dead=false; p.general=(p.general and p.general~="") and p.general or "zhangfei"
        p.maxHp=(p.maxHp and p.maxHp>0) and p.maxHp or 4; p.hp=(p.hp and p.hp>0) and p.hp or 4
      end
      local circle={}; for _,p in ipairs(ClientInstance.players) do table.insert(circle,p.id) end
      ClientCallback(ClientInstance,"ArrangeSeats",cbor.encode(circle),false)
      ClientCallback(ClientInstance,"StartGame",cbor.encode({}),false)
      ClientInstance.current=Self; Fk:currentRoom().current=Self
      local function findCardId(n) for _,c in ipairs(Fk.cards) do if c.name==n and c.suit~=Card.NoSuit then return c.id end end end
      local sid=findCardId("slash")
      Self.player_cards[Player.Hand]={}; Self:addCards(Player.Hand,{sid})
      Self.phase=Player.Play
      ClientCallback(ClientInstance,"PlayCard",cbor.encode({}),true)
      return sid
    `)
    // Drive the interaction via the global UpdateRequestUI (what the web client calls).
    lua.global.set('__slash', slashId)
    await lua.doString(`UpdateRequestUI("CardItem", __slash, "click", { selected = true })`)
    const targets = JSON.parse(await lua.doString(`
      local h=ClientInstance.current_request_handler; local out={}
      for pid,item in pairs(h.scene:getAllItems("Photo")) do if item.enabled then out[#out+1]=pid end end
      return json.encode(out)
    `) as string) as number[]
    expect(targets.length).toBeGreaterThan(0) // VM computed a valid target for Slash
    lua.global.set('__tgt', targets[0]!)
    await lua.doString(`UpdateRequestUI("Photo", __tgt, "click", { selected = true })`)
    await lua.doString(`UpdateRequestUI("Button", "OK", "click", {})`)

    expect(replies.length).toBe(1)
    const reply = replies[0] as { card: number; targets: number[] }
    expect(reply.card).toBe(slashId)
    expect(reply.targets).toEqual([targets[0]])
    lua.global.close()
  }, 30_000)
})
